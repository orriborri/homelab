import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { skaupat } from '../src/skaupat.js';
import { startFakeGrocy } from './fake-grocy.js';

// Scans one EAN whose S-kaupat product is `product`; returns what Grocy ended up with.
async function scanCatalogueProduct(product, { status = 200 } = {}) {
  const requests = [];
  const store = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(JSON.parse(raw));
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { product } }));
  });
  await new Promise(r => store.listen(0, '127.0.0.1', r));
  const fake = await startFakeGrocy();
  const app = createApp({
    grocyUrl: fake.url, apiKey: 'secret', locationId: 1, defaultBestBeforeDays: 30,
    catalogue: skaupat({ url: `http://127.0.0.1:${store.address().port}/`, storeId: '613756626' })
  });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${app.address().port}/api/scan`, { method: 'POST', body: JSON.stringify({ ean: '6410000000001' }) });
  const closeAll = () => { store.close(); app.close(); fake.close(); };
  return { res, fake, requests, closeAll };
}

const byWeight = (p) => p.fake.state.conversions[0]?.factor;

for (const [label, product, grams] of [
  ['explicit grams in name', { name: 'Oat drink 500 g' }, 500],
  ['kilograms with a decimal comma', { name: 'Flour 1,5 kg' }, 1500],
  ['multipack', { name: 'Yoghurt 6 x 25 g' }, 150],
  ['unit-labelled net weight preferred over name text', { name: 'Rice', measurement: { netWeight: '400 g' } }, 400],
  ['approximate weight is ignored', { name: 'Cheese n. 500 g' }, undefined],
  ['sold by kilo is ignored', { name: 'Apple 1 kg', basicQuantityUnit: 'KGM' }, undefined],
  ['bare numeric net weight is ignored', { name: 'Rice', measurement: { netWeight: 500 } }, undefined],
  ['two labelled weights need manual review', { name: 'Tuna 185 g (drained 130 g)' }, undefined]
]) {
  test(`package weight: ${label}`, async (t) => {
    const p = await scanCatalogueProduct({ ...product });
    t.after(p.closeAll);
    assert.equal(p.res.status, 200);
    assert.equal(byWeight(p), grams);
  });
}

test('description carries ingredients, nutrition and allergens, and the store id is queried', async (t) => {
  const p = await scanCatalogueProduct({
    name: 'Oat drink', description: 'Plant based', ingredientStatement: 'oats, water',
    nutrients: [{ name: 'Energy', value: '180 kJ' }], allergens: [{ allergenTypeText: 'Gluten', levelOfContainmentCode: 'CONTAINS' }]
  });
  t.after(p.closeAll);
  assert.equal(p.fake.state.products[0].description,
    'Plant based\nIngredients: oats, water\nNutrition (as listed by S-kaupat): Energy: 180 kJ\nAllergens: Gluten CONTAINS');
  assert.equal(p.requests[0].variables.storeId, '613756626');
  assert.equal(p.requests[0].variables.id, '6410000000001');
});

test('a catalogue miss is unknown (404) but a catalogue HTTP error is a bad gateway (502)', async (t) => {
  const miss = await scanCatalogueProduct(null);
  t.after(miss.closeAll);
  assert.equal(miss.res.status, 404);
  const err = await scanCatalogueProduct({ name: 'x' }, { status: 500 });
  t.after(err.closeAll);
  assert.equal(err.res.status, 502);
  assert.deepEqual(err.fake.state.products, []);
});
