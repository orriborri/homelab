import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { createRooms } from './rooms.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const rooms = createRooms();
// One JSON line per event for Loki. The room ID is the secret, so only a short hash is logged.
const tag = (room) => createHash('sha256').update(room).digest('hex').slice(0, 8);
const log = (event, fields) => console.log(JSON.stringify({ app: 'baby-monitor', event, ...fields }));

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/healthz') return res.end('ok');
  const file = normalize(path === '/' ? '/index.html' : path);
  try {
    const body = await readFile(join(PUBLIC, file));
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress;
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  let peer;
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    try {
      if (msg.type === 'join' && !peer) { peer = rooms.join(msg.room, msg.role, send); log('join', { role: peer.role, room: tag(peer.room), peer: peer.id }); }
      else if (msg.type === 'code' && peer?.role === 'baby') { send({ type: 'code', code: rooms.createCode(peer.room) }); log('code-created', { room: tag(peer.room) }); }
      else if (msg.type === 'log' && peer) log('client', { role: peer.role, room: tag(peer.room), peer: peer.id, what: String(msg.event).slice(0, 40), data: msg.data });
      else if (msg.type === 'resolve') { const room = rooms.resolveCode(String(msg.code).toUpperCase(), ip); send({ type: 'room', room }); log('code-resolved', { ok: !!room }); }
      else if (peer) { rooms.relay(peer, msg); log('relay', { role: peer.role, room: tag(peer.room), peer: peer.id, type: msg.type, to: msg.to }); }
    } catch (e) {
      log('error', { message: e.message });
      send({ type: 'error', message: e.message });
    }
  });
  ws.on('close', () => { if (peer) { rooms.leave(peer); log('leave', { role: peer.role, room: tag(peer.room), peer: peer.id }); } });
});

server.listen(process.env.PORT ?? 8080);
