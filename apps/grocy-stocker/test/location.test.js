import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { startFakeGrocy } from './fake-grocy.js';

async function setup(grocy) {
  const fake = await startFakeGrocy(grocy);
  const server = createApp({
    grocyUrl: fake.url, apiKey: 'secret', locationId: 1, defaultBestBeforeDays: 30,
    catalogue: async () => ({ name: 'New thing', description: '', packageGrams: null })
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, payload) => {
    const res = await fetch(base + path, { method: 'POST', body: JSON.stringify(payload) });
    return { status: res.status, body: await res.json() };
  };
  return { fake, base, post, close: () => { server.close(); fake.close(); } };
}

const known = {
  products: [{ id: 7, name: 'Oat drink', qu_id_purchase: 2, qu_id_stock: 2 }],
  barcodes: [{ id: 1, product_id: 7, barcode: '6410000000001' }],
  locations: [{ id: 42, name: 'K06-02', description: 'Rice' }]
};

test('a scan with a location code stocks there instead of the default', async (t) => {
  const { fake, post, close } = await setup(known);
  t.after(close);
  assert.equal((await post('/api/scan', { ean: '6410000000001', location: 'K06-02' })).status, 200);
  assert.equal(fake.state.stock[0].location_id, 42);
});

test('a newly created product also defaults to the scanned location', async (t) => {
  const { fake, post, close } = await setup(known);
  t.after(close);
  await post('/api/scan', { ean: '6410000000002', location: 'K06-02' });
  assert.equal(fake.state.products.at(-1).location_id, 42);
});

test('a malformed or unknown location is refused before anything is stocked', async (t) => {
  const { fake, post, close } = await setup(known);
  t.after(close);
  assert.equal((await post('/api/scan', { ean: '6410000000001', location: 'kitchen' })).status, 400);
  assert.equal((await post('/api/scan', { ean: '6410000000001', location: 'K09-09' })).status, 404);
  assert.deepEqual(fake.state.stock, []);
});

test('GET /api/locations lists locations and GET / serves the page', async (t) => {
  const { base, close } = await setup(known);
  t.after(close);
  assert.deepEqual(await (await fetch(`${base}/api/locations`)).json(), [{ id: 42, name: 'K06-02', description: 'Rice' }]);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/api/scan`)).status, 404);
});
