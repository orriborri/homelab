import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openFoodFacts, firstFound } from '../src/openfoodfacts.js';
import { createApp } from '../src/app.js';
import { startFakeGrocy } from './fake-grocy.js';

async function fakeOff(handler) {
  const server = http.createServer((req, res) => {
    const [status, body] = handler(req.url);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const tomato = {
  product: {
    product_name: 'Tomaattimurska', brands: 'Pirkka, Other', quantity: '390 g', ingredients_text: 'tomaatti', allergens: '',
    nutriments: { 'energy-kcal_100g': 23, proteins_100g: 0.6, fat_100g: 0.3, 'saturated-fat_100g': 0.1, carbohydrates_100g: 3.5, sugars_100g: 3.4, salt_100g: 0.1, fiber_100g: 1.4 }
  }
};

test('maps an Open Food Facts product to name, weight and per-100 g nutrition userfields', async (t) => {
  const off = await fakeOff(() => [200, tomato]);
  t.after(off.close);
  const found = await openFoodFacts({ url: off.url })('6410405060457');
  assert.equal(found.name, 'Tomaattimurska (Pirkka)');
  assert.equal(found.packageGrams, 390);
  assert.deepEqual(found.nutrition, {
    kcal_per100g: 23, protein_g_per100g: 0.6, fat_g_per100g: 0.3, saturated_fat_g_per100g: 0.1,
    carbs_g_per100g: 3.5, sugar_g_per100g: 3.4, salt_g_per100g: 0.1
  });
  assert.match(found.description, /Source: Open Food Facts/);
});

test('an unknown or nameless product is a miss, and an HTTP error is an outage', async (t) => {
  const off = await fakeOff(url => url.includes('missing') ? [404, {}] : url.includes('nameless') ? [200, { product: { product_name: ' ' } }] : [503, {}]);
  t.after(off.close);
  const lookup = openFoodFacts({ url: off.url });
  assert.equal(await lookup('missing'), null);
  assert.equal(await lookup('nameless'), null);
  await assert.rejects(lookup('boom'), /Open Food Facts -> 503/);
});

test('firstFound skips misses and outages, and only reports an outage when nothing found the product', async () => {
  const down = async () => { throw new Error('down'); };
  const miss = async () => null;
  const hit = async () => ({ name: 'x' });
  assert.deepEqual(await firstFound(down, hit)('1'), { name: 'x' });
  assert.deepEqual(await firstFound(miss, hit)('1'), { name: 'x' });
  assert.equal(await firstFound(miss, miss)('1'), null);
  await assert.rejects(firstFound(down, miss)('1'), /down/);
});

test('a product found with nutrition gets its nutrition userfields written alongside the gram factor', async (t) => {
  const fake = await startFakeGrocy();
  const server = createApp({
    grocyUrl: fake.url, apiKey: 'secret', locationId: 1, defaultBestBeforeDays: 30,
    catalogue: async () => ({ name: 'Tomaattimurska', description: '', packageGrams: 390, nutrition: { kcal_per100g: 23 } })
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); fake.close(); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/scan`, { method: 'POST', body: JSON.stringify({ ean: '6410405060457' }) });
  assert.equal((await res.json()).status, 'created');
  assert.deepEqual(Object.values(fake.state.userfields), [{ quantity_unit_stock_to_gram_factor: 1, kcal_per100g: 23 }]);
});
