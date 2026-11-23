import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { createRooms } from './rooms.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const rooms = createRooms();

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
      if (msg.type === 'join' && !peer) peer = rooms.join(msg.room, msg.role, send);
      else if (msg.type === 'code' && peer?.role === 'baby') send({ type: 'code', code: rooms.createCode(peer.room) });
      else if (msg.type === 'resolve') send({ type: 'room', room: rooms.resolveCode(String(msg.code).toUpperCase(), ip) });
      else if (peer) rooms.relay(peer, msg);
    } catch (e) {
      send({ type: 'error', message: e.message });
    }
  });
  ws.on('close', () => peer && rooms.leave(peer));
});

server.listen(process.env.PORT ?? 8080);
