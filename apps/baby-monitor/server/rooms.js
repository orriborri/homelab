import { randomInt, randomUUID } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I/L)
const CODE_TTL = 5 * 60_000;
const MAX_LISTENERS = 3;
const MAX_TRIES = 5; // per key per minute

const defaultCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export function createRooms({ now = Date.now, randomCode = defaultCode } = {}) {
  const rooms = new Map(); // id -> { baby, listeners: Map }
  const codes = new Map(); // code -> { room, exp }
  const tries = new Map(); // key -> timestamps

  function join(roomId, role, send) {
    if (typeof roomId !== 'string' || roomId.length < 16) throw new Error('bad room');
    if (role !== 'baby' && role !== 'listener') throw new Error('bad role');
    const room = rooms.get(roomId) ?? { baby: null, listeners: new Map() };
    rooms.set(roomId, room);
    const peer = { id: randomUUID().slice(0, 8), role, room: roomId, send };
    if (role === 'baby') {
      room.baby?.send({ type: 'replaced' });
      room.baby = peer;
      for (const l of room.listeners.values()) send({ type: 'peer-joined', id: l.id });
    } else {
      if (room.listeners.size >= MAX_LISTENERS) throw new Error('room full');
      room.listeners.set(peer.id, peer);
      room.baby?.send({ type: 'peer-joined', id: peer.id });
    }
    return peer;
  }

  function leave(peer) {
    const room = rooms.get(peer.room);
    if (!room) return;
    const msg = { type: 'peer-left', id: peer.id };
    if (peer.role === 'baby') {
      if (room.baby !== peer) return; // already replaced
      room.baby = null;
      for (const l of room.listeners.values()) l.send(msg);
    } else {
      room.listeners.delete(peer.id);
      room.baby?.send(msg);
    }
    if (!room.baby && !room.listeners.size) rooms.delete(peer.room);
  }

  function relay(peer, { to, ...msg }) {
    const room = rooms.get(peer.room);
    const target = peer.role === 'baby' ? room?.listeners.get(to) : room?.baby;
    if (target && (peer.role === 'baby' || to === target.id)) target.send({ ...msg, from: peer.id });
  }

  function createCode(room) {
    const code = randomCode();
    codes.set(code, { room, exp: now() + CODE_TTL });
    return code;
  }

  function resolveCode(code, key) {
    const t = now();
    const recent = (tries.get(key) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= MAX_TRIES) throw new Error('rate limited');
    tries.set(key, [...recent, t]);
    const entry = codes.get(code);
    codes.delete(code);
    return entry && entry.exp > t ? entry.room : null;
  }

  return { join, leave, relay, createCode, resolveCode };
}
