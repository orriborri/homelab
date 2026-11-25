import http from 'node:http';
import { cabinetCodes } from './cabinets.js';

const EAN = /^\d{8,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_BYTES = 10_000;

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
    if (!res.ok) {
      const reason = (await res.json().catch(() => ({}))).error_message ?? '';
      // Grocy rejecting the data (e.g. duplicate name) is a conflict; auth or server faults are a bad gateway.
      throw new HttpError([400, 409].includes(res.status) ? 409 : 502, `Grocy ${method} ${path} -> ${res.status} ${reason}`.trim());
    }
    return res.status === 204 ? null : res.json();
  }

  const unitId = (units, ...names) => units.find(u => names.includes(u.name.toLowerCase()))?.id;

  async function createProduct(ean, found) {
    const units = await grocy('GET', '/api/objects/quantity_units');
    const packId = unitId(units, 'pack', 'package', 'pakkaus', 'paketti', 'pkt');
    const gramId = unitId(units, 'gram', 'grams', 'gramma', 'grammaa', 'g');
    const pieceId = unitId(units, 'piece', 'pieces', 'kpl', 'kappale');
    const byWeight = found.packageGrams > 0;
    if (byWeight && !(packId && gramId)) throw new HttpError(409, 'Grocy needs Pack and Gram quantity units to stock a product with a known package weight');
    if (!byWeight && !pieceId) throw new HttpError(409, 'Grocy needs a Piece quantity unit to create a product without a package weight');
    const { created_object_id: id } = await grocy('POST', '/api/objects/products', {
      name: found.name, description: found.description, location_id: locationId,
      qu_id_purchase: byWeight ? packId : pieceId, qu_id_stock: byWeight ? gramId : pieceId,
      default_best_before_days: defaultBestBeforeDays
    });
    try {
      await grocy('POST', '/api/objects/product_barcodes', { product_id: id, barcode: ean });
      if (byWeight) {
        await grocy('POST', '/api/objects/quantity_unit_conversions', { product_id: id, from_qu_id: packId, to_qu_id: gramId, factor: found.packageGrams });
        await grocy('PUT', `/api/userfields/products/${id}`, { quantity_unit_stock_to_gram_factor: 1 });
      }
    } catch (err) {
      // An orphan would block retries (product names are unique), so undo the product; Grocy cascades its rows.
      await grocy('DELETE', `/api/objects/products/${id}`).catch(() => {});
      throw err;
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
      const found = await catalogue(ean).catch(err => { throw new HttpError(502, `catalogue unavailable: ${err.message}`); });
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

  // Safe to retry after a partial failure: codes that already exist are skipped.
  async function addCabinet({ description, ...spec }) {
    let codes;
    try { codes = cabinetCodes(spec); } catch (err) { throw new HttpError(400, err.message); }
    if (description !== undefined && typeof description !== 'string') throw new HttpError(400, 'description must be a string');
    const existing = new Set((await grocy('GET', '/api/objects/locations')).map(l => l.name));
    const created = [];
    for (const name of codes.filter(code => !existing.has(code))) {
      await grocy('POST', '/api/objects/locations', { name, description });
      created.push(name);
    }
    return { status: 'ok', created, existing: codes.filter(code => existing.has(code)) };
  }

  const routes = { '/api/scan': scan, '/api/cabinets': addCabinet };

  return http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      const route = req.method === 'POST' && routes[req.url];
      if (!route) throw new HttpError(404, 'not found');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'request body too large');
      }
      let payload;
      try { payload = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid JSON'); }
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'body must be a JSON object');
      reply(200, await route(payload));
    } catch (err) {
      reply(err.status ?? 502, { status: 'error', error: err.message });
    }
  });
}
