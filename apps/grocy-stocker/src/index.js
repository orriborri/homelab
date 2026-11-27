import { createApp } from './app.js';
import { skaupat } from './skaupat.js';
import { openFoodFacts, firstFound } from './openfoodfacts.js';

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
};

createApp({
  grocyUrl: env('GROCY_URL'),
  apiKey: env('GROCY_API_KEY'),
  locationId: Number(env('LOCATION_ID')), // the Kitchen location; per-session locations are a later slice
  defaultBestBeforeDays: Number(env('DEFAULT_BEST_BEFORE_DAYS', '30')),
  catalogue: firstFound(skaupat({ storeId: env('SKAUPAT_STORE_ID', '613756626') }), openFoodFacts())
}).listen(Number(env('PORT', '8080')));
