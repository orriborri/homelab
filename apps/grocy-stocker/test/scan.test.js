import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { startFakeGrocy } from './fake-grocy.js';

async function setup({ grocy, catalogue = async () => null } = {}) {
  const fake = await startFakeGrocy(grocy);
  const server = createApp({ grocyUrl: fake.url, apiKey: 'secret', catalogue, locationId: 1, defaultBestBeforeDays: 30 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const scan = async (payload) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/scan`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    return { status: res.status, body: await res.json() };
  };
  return { fake, scan, close: () => { server.close(); fake.close(); } };
}

test('scanning a known EAN stocks it in the default location with the given date', async (t) => {
  const { fake, scan, close } = await setup({
    grocy: {
      products: [{ id: 7, name: 'Oat drink', qu_id_purchase: 2, qu_id_stock: 2 }],
      barcodes: [{ id: 1, product_id: 7, barcode: '6410000000001' }]
    }
  });
  t.after(close);
  const res = await scan({ ean: '6410000000001', bestBefore: '2027-01-31' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'stocked');
  assert.deepEqual(fake.state.stock, [{ product_id: 7, amount: 1, best_before_date: '2027-01-31', location_id: 1 }]);
});

test('scanning an unknown EAN creates the product from the catalogue, then stocks one pack in grams', async (t) => {
  const { fake, scan, close } = await setup({
    catalogue: async (ean) => ({ name: 'Oat drink 500 g', description: 'Ingredients: oats', packageGrams: 500 })
  });
  t.after(close);
  const res = await scan({ ean: '6410000000002', bestBefore: '2027-02-01' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'created');
  const [product] = fake.state.products;
  assert.deepEqual(
    { name: product.name, description: product.description, location_id: product.location_id, qu_id_purchase: product.qu_id_purchase, qu_id_stock: product.qu_id_stock, default_best_before_days: product.default_best_before_days },
    { name: 'Oat drink 500 g', description: 'Ingredients: oats', location_id: 1, qu_id_purchase: 3, qu_id_stock: 4, default_best_before_days: 30 }
  );
  assert.deepEqual(fake.state.barcodes.map(b => [b.product_id, b.barcode]), [[product.id, '6410000000002']]);
  assert.deepEqual(fake.state.conversions.map(c => [c.product_id, c.from_qu_id, c.to_qu_id, c.factor]), [[product.id, 3, 4, 500]]);
  assert.deepEqual(fake.state.userfields[product.id], { quantity_unit_stock_to_gram_factor: 1 });
  // one 500 g pack = 500 stock units (grams)
  assert.deepEqual(fake.state.stock, [{ product_id: product.id, amount: 500, best_before_date: '2027-02-01', location_id: 1 }]);
});

test('an unknown EAN without a usable package weight is created in pieces', async (t) => {
  const { fake, scan, close } = await setup({ catalogue: async () => ({ name: 'Banana', description: '', packageGrams: null }) });
  t.after(close);
  await scan({ ean: '6410000000003' });
  const [product] = fake.state.products;
  assert.equal(product.qu_id_purchase, 2);
  assert.equal(product.qu_id_stock, 2);
  assert.deepEqual(fake.state.conversions, []);
  assert.deepEqual(fake.state.stock, [{ product_id: product.id, amount: 1, location_id: 1 }]);
});

test('a known grams-stocked product is stocked by pack using its stored conversion', async (t) => {
  const { fake, scan, close } = await setup({
    grocy: {
      products: [{ id: 9, name: 'Rice', qu_id_purchase: 3, qu_id_stock: 4 }],
      barcodes: [{ id: 2, product_id: 9, barcode: '6410000000004' }],
      conversions: [{ id: 5, product_id: 9, from_qu_id: 3, to_qu_id: 4, factor: 1000 }]
    }
  });
  t.after(close);
  await scan({ ean: '6410000000004', count: 2 });
  assert.equal(fake.state.stock[0].amount, 2000);
});

test('rejects malformed input without touching Grocy', async (t) => {
  const { fake, scan, close } = await setup();
  t.after(close);
  assert.equal((await scan({ ean: 'abc' })).status, 400);
  assert.equal((await scan({ ean: '6410000000001', bestBefore: '31.1.2027' })).status, 400);
  assert.equal((await scan({ ean: '6410000000001', count: 0 })).status, 400);
  assert.deepEqual(fake.state.calls, []);
});

test('an EAN unknown to both Grocy and the catalogue is reported, and nothing is created', async (t) => {
  const { fake, scan, close } = await setup();
  t.after(close);
  const res = await scan({ ean: '6410000000005' });
  assert.equal(res.status, 404);
  assert.deepEqual(fake.state.products, []);
});

test('a catalogue outage is reported as a bad gateway', async (t) => {
  const { scan, close } = await setup({ catalogue: async () => { throw new Error('boom'); } });
  t.after(close);
  assert.equal((await scan({ ean: '6410000000006' })).status, 502);
});

test('a Grocy failure is reported as a bad gateway', async (t) => {
  const { fake, scan, close } = await setup();
  t.after(close);
  const server = createApp({ grocyUrl: fake.url, apiKey: 'wrong', catalogue: async () => null, locationId: 1, defaultBestBeforeDays: 30 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/scan`, { method: 'POST', body: JSON.stringify({ ean: '6410000000007' }) });
  assert.equal(res.status, 502);
});
