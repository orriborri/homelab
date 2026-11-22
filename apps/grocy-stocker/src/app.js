import http from 'node:http';

const EAN = /^\d{8,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp({ grocyUrl, apiKey, catalogue, locationId, defaultBestBeforeDays }) {
  async function grocy(method, path, body) {
    const res = await fetch(grocyUrl + path, {
      method,
      headers: { 'GROCY-API-KEY': apiKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!res.ok) throw new HttpError(502, `Grocy ${method} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  const unitId = (units, ...names) => units.find(u => names.includes(u.name.toLowerCase()))?.id;

  async function createProduct(ean, found) {
    const units = await grocy('GET', '/api/objects/quantity_units');
    const packId = unitId(units, 'pack', 'package', 'pakkaus', 'paketti', 'pkt');
    const gramId = unitId(units, 'gram', 'grams', 'gramma', 'grammaa', 'g');
    const pieceId = unitId(units, 'piece', 'pieces', 'kpl', 'kappale') ?? units[0].id;
    const byWeight = found.packageGrams > 0 && packId && gramId;
    const { created_object_id: id } = await grocy('POST', '/api/objects/products', {
      name: found.name, description: found.description, location_id: locationId,
      qu_id_purchase: byWeight ? packId : pieceId, qu_id_stock: byWeight ? gramId : pieceId,
      default_best_before_days: defaultBestBeforeDays
    });
    await grocy('POST', '/api/objects/product_barcodes', { product_id: id, barcode: ean });
    if (byWeight) {
      await grocy('POST', '/api/objects/quantity_unit_conversions', { product_id: id, from_qu_id: packId, to_qu_id: gramId, factor: found.packageGrams });
      await grocy('PUT', `/api/userfields/products/${id}`, { quantity_unit_stock_to_gram_factor: 1 });
    }
    return id;
  }

  // Grocy's add-stock amount is in stock units; a pack count needs the product's pack->stock factor.
  async function stockAmount(productId, count) {
    const product = await grocy('GET', `/api/objects/products/${productId}`);
    if (product.qu_id_purchase === product.qu_id_stock) return count;
    const [conversion] = await grocy('GET', `/api/objects/quantity_unit_conversions?query[]=product_id=${productId}&query[]=from_qu_id=${product.qu_id_purchase}&query[]=to_qu_id=${product.qu_id_stock}`);
    if (!conversion) throw new HttpError(409, 'product has different purchase and stock units but no stored conversion');
    return count * conversion.factor;
  }

  async function scan({ ean, bestBefore, count = 1 }) {
    if (!EAN.test(String(ean))) throw new HttpError(400, 'ean must be 8-14 digits');
    if (bestBefore !== undefined && !DATE.test(bestBefore)) throw new HttpError(400, 'bestBefore must be YYYY-MM-DD');
    if (!Number.isInteger(count) || count < 1) throw new HttpError(400, 'count must be a positive integer');

    const [barcode] = await grocy('GET', `/api/objects/product_barcodes?query[]=barcode=${ean}`);
    let status = 'stocked';
    let productId = barcode?.product_id;
    if (productId === undefined) {
      const found = await catalogue(ean);
      if (!found) throw new HttpError(404, 'unknown product');
      productId = await createProduct(ean, found);
      status = 'created';
    }
    const amount = await stockAmount(productId, count);
    await grocy('POST', `/api/stock/products/${productId}/add`, {
      amount, ...(bestBefore && { best_before_date: bestBefore }), location_id: locationId
    });
    return { status, productId };
  }

  return http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method !== 'POST' || req.url !== '/api/scan') throw new HttpError(404, 'not found');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let payload;
      try { payload = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid JSON'); }
      reply(200, await scan(payload));
    } catch (err) {
      reply(err.status ?? 502, { status: 'error', error: err.message });
    }
  });
}
