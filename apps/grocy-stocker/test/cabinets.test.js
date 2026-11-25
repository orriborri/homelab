import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabinetCodes } from '../src/cabinets.js';
import { createApp } from '../src/app.js';
import { startFakeGrocy } from './fake-grocy.js';

test('shelf codes are fixed length and count from the top', () => {
  assert.deepEqual(cabinetCodes({ room: 'K', cabinet: 6, shelves: 3 }), ['K06-01', 'K06-02', 'K06-03']);
});

test('matrix codes are row digit then column digit, same length as shelf codes', () => {
  const codes = cabinetCodes({ room: 'G', cabinet: 1, rows: 2, cols: 3 });
  assert.deepEqual(codes, ['G01-11', 'G01-12', 'G01-13', 'G01-21', 'G01-22', 'G01-23']);
  assert.ok(codes.every(c => c.length === 6));
});

test('invalid specs are rejected', () => {
  for (const spec of [
    { room: 'k', cabinet: 1, shelves: 1 }, { room: 'KK', cabinet: 1, shelves: 1 }, { cabinet: 1, shelves: 1 },
    { room: 'K', cabinet: 0, shelves: 1 }, { room: 'K', cabinet: 100, shelves: 1 }, { room: 'K', cabinet: 1.5, shelves: 1 },
    { room: 'K', cabinet: 1 }, { room: 'K', cabinet: 1, shelves: 0 }, { room: 'K', cabinet: 1, shelves: 100 },
    { room: 'K', cabinet: 1, shelves: 2, rows: 1, cols: 1 }, { room: 'G', cabinet: 1, rows: 2 }, { room: 'G', cabinet: 1, rows: 10, cols: 1 }
  ]) assert.throws(() => cabinetCodes(spec), RangeError, JSON.stringify(spec));
});

async function setup(grocy) {
  const fake = await startFakeGrocy(grocy);
  const server = createApp({ grocyUrl: fake.url, apiKey: 'secret', catalogue: async () => null, locationId: 1, defaultBestBeforeDays: 30 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const post = async (payload) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/cabinets`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    return { status: res.status, body: await res.json() };
  };
  return { fake, post, close: () => { server.close(); fake.close(); } };
}

test('adding a cabinet creates one Grocy location per slot with the description', async (t) => {
  const { fake, post, close } = await setup();
  t.after(close);
  const res = await post({ room: 'K', cabinet: 5, shelves: 2, description: 'Rice and pasta' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', created: ['K05-01', 'K05-02'], existing: [] });
  assert.deepEqual(fake.state.locations.map(({ name, description }) => ({ name, description })),
    [{ name: 'K05-01', description: 'Rice and pasta' }, { name: 'K05-02', description: 'Rice and pasta' }]);
});

test('repeating the request, or one that overlaps, only creates what is missing', async (t) => {
  const { fake, post, close } = await setup({ locations: [{ id: 3, name: 'K05-01' }] });
  t.after(close);
  const res = await post({ room: 'K', cabinet: 5, shelves: 3 });
  assert.deepEqual(res.body, { status: 'ok', created: ['K05-02', 'K05-03'], existing: ['K05-01'] });
  assert.equal(fake.state.locations.length, 3);
  assert.deepEqual((await post({ room: 'K', cabinet: 5, shelves: 3 })).body.created, []);
});

test('a bad spec is a 400 and Grocy is not touched', async (t) => {
  const { fake, post, close } = await setup();
  t.after(close);
  assert.equal((await post({ room: 'K', cabinet: 5 })).status, 400);
  assert.equal((await post({ room: 'K', cabinet: 5, shelves: 1, description: 7 })).status, 400);
  assert.deepEqual(fake.state.calls, []);
});
