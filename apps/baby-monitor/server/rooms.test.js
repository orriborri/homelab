import test from 'node:test';
import assert from 'node:assert/strict';
import { createRooms } from './rooms.js';

const peer = () => { const got = []; return { got, send: (m) => got.push(m) }; };

test('baby is told about listeners, in either join order', () => {
  const r = createRooms();
  const l1 = peer(); const lp = r.join('room1-0123456789abcdef', 'listener', l1.send);
  const b = peer(); r.join('room1-0123456789abcdef', 'baby', b.send);
  assert.deepEqual(b.got, [{ type: 'peer-joined', id: lp.id }]);
  const l2 = peer(); const lp2 = r.join('room1-0123456789abcdef', 'listener', l2.send);
  assert.deepEqual(b.got.at(-1), { type: 'peer-joined', id: lp2.id });
});

test('relay goes only to the addressed peer in the same room', () => {
  const r = createRooms();
  const b = peer(); const bp = r.join('a-0123456789abcdefgh', 'baby', b.send);
  const l = peer(); const lp = r.join('a-0123456789abcdefgh', 'listener', l.send);
  const other = peer(); r.join('b-0123456789abcdefgh', 'listener', other.send);
  r.relay(bp, { type: 'offer', to: lp.id, sdp: 'x' });
  assert.deepEqual(l.got, [{ type: 'offer', sdp: 'x', from: bp.id }]);
  assert.deepEqual(other.got, []);
});

test('leaving notifies the other side; listeners capped at 3; one baby wins', () => {
  const r = createRooms();
  const b = peer(); const bp = r.join('a-0123456789abcdefgh', 'baby', b.send);
  const ls = [1, 2, 3].map(() => { const p = peer(); return [p, r.join('a-0123456789abcdefgh', 'listener', p.send)]; });
  assert.throws(() => r.join('a-0123456789abcdefgh', 'listener', () => {}), /full/);
  r.leave(ls[0][1]);
  assert.deepEqual(b.got.at(-1), { type: 'peer-left', id: ls[0][1].id });
  r.leave(bp);
  assert.deepEqual(ls[1][0].got.at(-1), { type: 'peer-left', id: bp.id });
});

test('codes are single-use, expire after 5 min and are rate-limited', () => {
  let t = 0;
  const r = createRooms({ now: () => t, randomCode: () => 'ABC234' });
  assert.equal(r.createCode('room1-0123456789abcdef'), 'ABC234');
  assert.equal(r.resolveCode('ABC234', 'ip'), 'room1-0123456789abcdef');
  assert.equal(r.resolveCode('ABC234', 'ip'), null);
  r.createCode('room2-0123456789abcdef');
  t = 5 * 60_000 + 1;
  assert.equal(r.resolveCode('ABC234', 'ip'), null);
  for (let i = 0; i < 5; i++) r.resolveCode('ZZZZZZ', 'ip2');
  assert.throws(() => r.resolveCode('ZZZZZZ', 'ip2'), /rate/);
});
