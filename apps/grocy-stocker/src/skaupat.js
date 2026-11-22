const QUERY = `query ProductByEan($id: ID!, $storeId: ID!) {
  product(id: $id, storeId: $storeId) {
    id
    name
    basicQuantityUnit
    description
    ingredientStatement
    nutrients { name value ri kcal }
    allergens { allergenTypeText levelOfContainmentCode }
    measurement { netWeight }
  }
}`;

// Port of the weight rules in apps/grocy/SKaupatBarcodeLookupPlugin.php (PackageGrams).
export function packageGrams(product) {
  if (['KG', 'KGM'].includes(String(product.basicQuantityUnit ?? '').toUpperCase())
    || /(?:\bn\.|\bnoin\b|\bapprox\.?|~|≈)/iu.test(product.name)) return null;
  // The API's bare numeric netWeight has no verified unit, so only explicit units count.
  const netWeight = product.measurement?.netWeight;
  const candidates = typeof netWeight === 'string' ? [netWeight, product.name] : [product.name];
  for (const text of candidates) {
    const matches = [...text.matchAll(/(?<![\p{L}\d.,])(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g)\b/giu)];
    if (matches.length > 1) return null; // e.g. net and drained weight: manual review
    if (matches.length !== 1) continue;
    const [, count, amount, unit] = matches[0];
    const grams = parseFloat(amount.replace(',', '.')) * (unit.toLowerCase() === 'kg' ? 1000 : 1) * (count ? Number(count) : 1);
    return Number.isFinite(grams) && grams > 0 ? grams : null;
  }
  return null;
}

function describe(product) {
  let text = (product.description ?? '').trim();
  if (product.ingredientStatement) text += `\nIngredients: ${product.ingredientStatement}`;
  const nutrition = (product.nutrients ?? []).filter(n => n.name && n.value != null).map(n => `${n.name}: ${n.value}`);
  if (nutrition.length) text += `\nNutrition (as listed by S-kaupat): ${nutrition.join('; ')}`;
  const allergens = (product.allergens ?? []).map(a => `${a.allergenTypeText ?? ''} ${a.levelOfContainmentCode ?? ''}`.trim()).filter(Boolean);
  if (allergens.length) text += `\nAllergens: ${allergens.join('; ')}`;
  return text;
}

// Returns null when the catalogue has no such product; throws when the catalogue is unreachable.
export function skaupat({ url = 'https://api.s-kaupat.fi/', storeId }) {
  return async (ean) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'Grocy-Stocker/1.0' },
      body: JSON.stringify({ query: QUERY, variables: { id: String(ean), storeId } }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`S-kaupat -> ${res.status}`);
    const product = (await res.json()).data?.product;
    if (!product?.name) return null;
    return { name: product.name, description: describe(product), packageGrams: packageGrams(product) };
  };
}
