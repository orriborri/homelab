import { packageGrams } from './skaupat.js';

const FIELDS = 'product_name,brands,quantity,nutriments,ingredients_text,allergens';

// Grocy userfield -> Open Food Facts per-100 g nutriment.
const NUTRITION = {
  kcal_per100g: 'energy-kcal_100g',
  protein_g_per100g: 'proteins_100g',
  fat_g_per100g: 'fat_100g',
  saturated_fat_g_per100g: 'saturated-fat_100g',
  carbs_g_per100g: 'carbohydrates_100g',
  sugar_g_per100g: 'sugars_100g',
  salt_g_per100g: 'salt_100g'
};

// Returns null when Open Food Facts has no usable product; throws when it is unreachable.
export function openFoodFacts({ url = 'https://world.openfoodfacts.org' } = {}) {
  return async (ean) => {
    const res = await fetch(`${url}/api/v2/product/${ean}.json?fields=${FIELDS}`, {
      headers: { 'user-agent': 'grocy-stocker/1.0 (homelab)', accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts -> ${res.status}`);
    const { product } = await res.json();
    const productName = product?.product_name?.trim();
    if (!productName) return null;
    const brand = product.brands?.split(',')[0].trim();
    const name = brand && !productName.toLowerCase().includes(brand.toLowerCase()) ? `${productName} (${brand})` : productName;
    const nutrition = Object.fromEntries(Object.entries(NUTRITION)
      .map(([field, key]) => [field, product.nutriments?.[key]])
      .filter(([, value]) => typeof value === 'number'));
    const lines = [product.ingredients_text && `Ingredients: ${product.ingredients_text.trim()}`, product.allergens && `Allergens: ${product.allergens}`].filter(Boolean);
    return {
      name,
      description: `${lines.join('\n')}${lines.length ? '\n' : ''}Source: Open Food Facts`,
      packageGrams: packageGrams({ name: productName, measurement: { netWeight: product.quantity } }),
      nutrition
    };
  };
}

// Tries each catalogue in order. A miss moves on; an outage is only reported if nothing else found the product.
export function firstFound(...catalogues) {
  return async (ean) => {
    let failure;
    for (const lookup of catalogues) {
      try {
        const found = await lookup(ean);
        if (found) return found;
      } catch (err) { failure = err; }
    }
    if (failure) throw failure;
    return null;
  };
}
