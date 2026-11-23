(function () {
  var $ = function (id) { return document.getElementById(id); };
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem('baby') || '{}'); } catch (e) { return {}; } },
    set: function (v) { localStorage.setItem('baby', JSON.stringify(v)); }
  };
  var show = function (id) { ['home', 'baby', 'listen'].forEach(function (x) { $(x).hidden = x !== id; }); };
  var newRoom = function () {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  var rms = function (analyser, buf) {
    analyser.getFloatTimeDomainData(buf);
    var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  // Reconnecting WebSocket: retry every 2 s; onopen re-sends join.
  function connect(onopen, onmsg, onstate) {
    var ws, api = { send: function (m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); } };
    (function open() {
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      ws.onopen = function () { onstate(true); onopen(api); };
      ws.onmessage = function (e) { onmsg(JSON.parse(e.data), api); };
      ws.onclose = function () { onstate(false); setTimeout(open, 2000); };
    })();
    return api;
  }

  var wake;
  function keepAwake() {
    if (!('wakeLock' in navigator)) { $('status').textContent = 'No Wake Lock here: set screen timeout to "never".'; return; }
    var get = function () { navigator.wakeLock.request('screen').then(function (l) { wake = l; }, function () {}); };
    get();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') get(); });
  }

  // ---- baby station ----
  function babyStation(room) {
    show('baby'); $('title').textContent = 'Baby station';
    var url = location.origin + '/#room=' + room;
    var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    $('qr').firstChild.style.cssText = 'width:min(80vw,320px);background:#fff';
    $('btn-dim').onclick = function () { $('dim').hidden = false; };
    $('dim').onclick = function () { $('dim').hidden = true; };
    $('btn-new').onclick = function () { store.set({ role: 'baby', room: newRoom() }); location.reload(); };
    keepAwake();

    var pcs = {}, channels = {}, level = 0, battery = { level: null, charging: null };
    if (navigator.getBattery) navigator.getBattery().then(function (b) {
      var upd = function () { battery = { level: b.level, charging: b.charging }; };
      upd(); b.onlevelchange = upd; b.onchargingchange = upd;
    });
    var count = function () { $('listeners').textContent = Object.keys(pcs).length; };

    navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: false, autoGainControl: true, channelCount: 1 } }).then(function (stream) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      var buf = new Float32Array(analyser.fftSize);
      // Sample every 50 ms, report the peak per 250 ms: a 23 ms window every 250 ms would miss short sounds.
      var ticks = 0;
      setInterval(function () {
        level = Math.max(level, rms(analyser, buf));
        if (++ticks % 5) return;
        var msg = JSON.stringify({ level: level, battery: battery.level, charging: battery.charging });
        level = 0;
        Object.keys(channels).forEach(function (id) { if (channels[id].readyState === 'open') channels[id].send(msg); });
      }, 50);

      var ws = connect(function (api) {
        api.send({ type: 'join', room: room, role: 'baby' });
        api.send({ type: 'code' });
      }, function (m) {
        if (m.type === 'code') $('code').textContent = m.code;
        else if (m.type === 'replaced') { $('status').textContent = 'Another baby station took over this room.'; }
        else if (m.type === 'peer-joined') {
          var pc = new RTCPeerConnection({ iceServers: [] });
          pcs[m.id] = pc; count();
          stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
          channels[m.id] = pc.createDataChannel('status');
          pc.onicecandidate = function (e) { if (e.candidate) ws.send({ type: 'ice', to: m.id, candidate: e.candidate }); };
          pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
            .then(function () { ws.send({ type: 'offer', to: m.id, sdp: pc.localDescription }); });
        } else if (m.type === 'answer' && pcs[m.from]) pcs[m.from].setRemoteDescription(m.sdp);
        else if (m.type === 'ice' && pcs[m.from]) pcs[m.from].addIceCandidate(m.candidate).catch(function () {});
        else if (m.type === 'peer-left' && pcs[m.id]) { pcs[m.id].close(); delete pcs[m.id]; delete channels[m.id]; count(); }
      }, function (up) { $('status').textContent = up ? 'Connected to server' : 'Server offline, retrying…'; });
      setInterval(function () { ws.send({ type: 'code' }); }, 4.5 * 60000); // codes live 5 min
    }, function () { $('status').textContent = 'Microphone access is needed.'; });
  }

  // ---- listener ----
  function listener(room) {
    show('listen'); $('title').textContent = 'Listening';
    var settings = store.get();
    $('threshold').value = settings.threshold || 0.1;
    $('threshold').onchange = function () { settings = store.get(); settings.threshold = +$('threshold').value; store.set(settings); };
    $('btn-start').onclick = function () {
      $('btn-start').hidden = true; $('live').hidden = false;
      var ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      run(ctx);
    };

    function run(ctx) {
      var audio = new Audio(), pc, lastStatus = Date.now(), loudSince = 0, snoozedUntil = 0, alarmTimer;
      var beep = function (freq, ms) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = freq; g.gain.value = 1; o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + ms / 1000);
      };
      var raise = function (text) {
        $('alarm').hidden = false; $('alarm-text').textContent = text;
        if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
      };
      $('btn-snooze').onclick = function () { snoozedUntil = Date.now() + 5 * 60000; $('alarm').hidden = true; };

      setInterval(function () {
        var offline = Date.now() - lastStatus > 10000;
        if (offline && Date.now() > snoozedUntil) { raise('Baby station offline'); beep(880, 400); }
        else if (!offline && $('alarm-text').textContent === 'Baby station offline') $('alarm').hidden = true;
      }, 1000);

      var ws = connect(function (api) { api.send({ type: 'join', room: room, role: 'listener' }); }, function (m) {
        if (m.type === 'offer') {
          if (pc) pc.close();
          pc = new RTCPeerConnection({ iceServers: [] });
          pc.onicecandidate = function (e) { if (e.candidate) ws.send({ type: 'ice', to: m.from, candidate: e.candidate }); };
          pc.ontrack = function (e) { audio.srcObject = e.streams[0]; audio.play(); };
          pc.ondatachannel = function (e) {
            e.channel.onmessage = function (ev) {
              var s = JSON.parse(ev.data); lastStatus = Date.now();
              $('bar').style.width = Math.min(100, s.level * 300) + '%';
              if (s.battery != null) {
                var pct = Math.round(s.battery * 100);
                $('batt').textContent = 'Baby station battery ' + pct + '%' + (s.charging ? ' (charging)' : (pct < 20 ? ' — LOW, plug it in' : ''));
              }
              var now = Date.now();
              if (s.level < settings.threshold) loudSince = 0;
              else if (!loudSince) loudSince = now;
              else if (now - loudSince >= 2000 && now > snoozedUntil) {
                loudSince = now + 10000; // at most one alert per 12 s
                raise('Baby is making noise'); beep(660, 300);
                if ('Notification' in window && Notification.permission === 'granted') new Notification('Baby is making noise');
              }
            };
          };
          pc.setRemoteDescription(m.sdp).then(function () { return pc.createAnswer(); })
            .then(function (a) { return pc.setLocalDescription(a); })
            .then(function () { ws.send({ type: 'answer', to: m.from, sdp: pc.localDescription }); });
        } else if (m.type === 'ice' && pc) pc.addIceCandidate(m.candidate).catch(function () {});
        else if (m.type === 'error') $('status').textContent = m.message;
      }, function (up) { if (!up) $('status').textContent = 'Reconnecting…'; else $('status').textContent = ''; });
    }
  }

  // ---- start ----
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  var m = /room=([0-9a-f]{32})/.exec(location.hash);
  var saved = store.get();
  if (m) { store.set({ role: 'listener', room: m[1], threshold: saved.threshold }); history.replaceState(null, '', '/'); }
  saved = store.get();

  if (saved.role === 'baby') babyStation(saved.room);
  else if (saved.role === 'listener') listener(saved.room);
  else {
    show('home');
    $('btn-baby').onclick = function () { store.set({ role: 'baby', room: newRoom() }); location.reload(); };
    $('btn-listen').onclick = function () {
      var code = (prompt('Enter the 6-character code shown on the baby station') || '').trim();
      if (!code) return;
      connect(function (api) { api.send({ type: 'resolve', code: code }); }, function (m, api) {
        if (m.type === 'room' && m.room) { store.set({ role: 'listener', room: m.room }); location.reload(); }
        else $('status').textContent = m.message || 'Code not valid or expired.';
      }, function () {});
    };
  }
})();
