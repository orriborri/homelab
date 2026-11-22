import http from 'node:http';

// Minimal in-memory stand-in for the Grocy REST routes the stocker uses.
export async function startFakeGrocy(seed = {}) {
  const state = {
    products: [], barcodes: [], conversions: [], stock: [], userfields: {},
    units: [{ id: 2, name: 'Piece' }, { id: 3, name: 'Pack' }, { id: 4, name: 'Gram' }],
    calls: [],
    ...seed
  };
  let nextId = 100;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    state.calls.push({ method: req.method, path: url.pathname, body });
    const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers['grocy-api-key'] !== 'secret') return send(401, { error_message: 'bad key' });
    const filters = Object.fromEntries(url.searchParams.getAll('query[]').map(q => q.split('=')));
    const match = rows => rows.filter(r => Object.entries(filters).every(([k, v]) => String(r[k]) === v));
    const m = (re) => url.pathname.match(re);
    let x;
    if (req.method === 'GET' && url.pathname === '/api/objects/product_barcodes') return send(200, match(state.barcodes));
    if (req.method === 'GET' && url.pathname === '/api/objects/quantity_unit_conversions') return send(200, match(state.conversions));
    if (req.method === 'GET' && url.pathname === '/api/objects/quantity_units') return send(200, state.units);
    if (req.method === 'GET' && (x = m(/^\/api\/objects\/products\/(\d+)$/))) {
      const p = state.products.find(p => p.id === Number(x[1]));
      return p ? send(200, p) : send(400, { error_message: 'not found' });
    }
    if (req.method === 'POST' && url.pathname === '/api/objects/products') {
      const id = nextId++; state.products.push({ id, ...body }); return send(200, { created_object_id: id });
    }
    if (req.method === 'POST' && url.pathname === '/api/objects/product_barcodes') {
      const id = nextId++; state.barcodes.push({ id, ...body }); return send(200, { created_object_id: id });
    }
    if (req.method === 'POST' && url.pathname === '/api/objects/quantity_unit_conversions') {
      const id = nextId++; state.conversions.push({ id, ...body }); return send(200, { created_object_id: id });
    }
    if (req.method === 'PUT' && (x = m(/^\/api\/userfields\/products\/(\d+)$/))) {
      state.userfields[x[1]] = body; return send(204, {});
    }
    if (req.method === 'POST' && (x = m(/^\/api\/stock\/products\/(\d+)\/add$/))) {
      state.stock.push({ product_id: Number(x[1]), ...body }); return send(200, [{}]);
    }
    return send(404, { error_message: 'unhandled ' + req.method + ' ' + url.pathname });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
