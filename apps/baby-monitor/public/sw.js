const CACHE = 'baby-v1';
const SHELL = ['/', '/app.js', '/qrcode.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
// Network first so redeploys show up; cache only when the pod is down.
self.addEventListener('fetch', (e) => {
  if (e.request.method === 'GET') e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
