# Research: APIs for a Grocy stocking PWA

Researched 2026-11-22. Grocy facts are from source tag `v4.7.1` (commit `7d15c46bbdc35d4958cae99209ba170667dc1d64`), the version shipped by `lscr.io/linuxserver/grocy:latest` today (Docker Hub tags `latest`/`4.7.1`; linuxserver release `v4.7.1-ls352`). Re-check if the image tag moves.
Paths below `grocy:` refer to that tag of https://github.com/grocy/grocy.

## 1. S-kaupat GraphQL API

**Access from the sandbox:** `POST https://api.s-kaupat.fi/` returned HTTP 403 (CloudFront block). Nothing below was exercised live; it is taken from open-source clients that call the same API. Treat field names as UNVERIFIED against the live schema.

**Two calling styles exist:**

1. Plain query body, as used by the repo plugin `apps/grocy/SKaupatBarcodeLookupPlugin.php` (POST JSON `{query, variables}`, root field `product(id: $id, storeId: $storeId)`, where `id` is the EAN). This works for EAN -> product. Whether the plain-query style is still accepted for search is UNVERIFIED.
2. The web app's style: an HTTP GET with Apollo **persisted queries**:
   `GET https://api.s-kaupat.fi/?operationName=RemoteFilteredProducts&variables=<json>&extensions={"persistedQuery":{"version":1,"sha256Hash":"<hash>"}}`
   Source: p18a/mcp-ruoka `src/browser/s-kaupat.ts` @ ef37b32 (lines ~205-225 build the URL; lines ~62-92 capture the hash from `https://www.s-kaupat.fi/hakutulokset?queryString=test`). aapokat/JKL_Tarjoukset `site/collectors/s-kaupat.js` @ be9ef0e (lines ~11-22) does the same with a hard-coded hash.

**Name search = operation `RemoteFilteredProducts`:**
- variables: `{queryString, storeId, from, limit}`; JKL also sends `facets:[]`, `filters:[]`, `fetchSponsoredContent:false`, `useRandomId:false` (limit 100 is used there).
- response: `data.store.products { total, productListItems[] { product {...}, labels[] } }`.
- Product fields seen in client code: `name`, `ean`, `price`, `brandName`, `slug`, `pricing { currentPrice, comparisonPrice, comparisonUnit, campaignPrice, regularPrice, lowest30DayPrice, campaignPriceValidUntil }`, `productDetails.productImages.mainImage.urlTemplate`, `hierarchyPath[] { name }`. (mcp-ruoka `s-kaupat.ts` lines ~118-147, 185-196; JKL line ~38.)
- Unit price: `pricing.comparisonPrice` + `comparisonUnit` (values like `KG`, `KGM`, `LTR`, `KPL`; JKL line ~12 maps them).
- The persisted hash changes when the site is redeployed. The server answers `PERSISTED_QUERY_NOT_FOUND` for a stale hash; mcp-ruoka re-extracts it with a headless browser. Both projects document this fragility (JKL README: the hash "voi vaihtua, kun sivusto päivittyy").
- Sending the full query text instead of a hash (APQ fallback) is UNVERIFIED; the hash-less route is the one the repo plugin uses for `product(...)`, so try `store(id:) { products(queryString:...) }` as plain query text, but verify from a non-blocked network.

**Hierarchy / category:** `hierarchyPath` is an ordered list of `{name}` from top-level category downward. mcp-ruoka uses `hierarchyPath[0].name` as the category; JKL joins the whole path with " > ". Names are Finnish (e.g. a top level like "Maito, munat ja voi" / "Pakasteet" - exact names UNVERIFIED, no sample response was available). A fridge/freezer/pantry mapping would be a lookup table keyed on top-level (and maybe second-level) `hierarchyPath` names; a "Pakasteet"-style top level is the obvious freezer signal, but confirm against real data.

**Headers:** both clients send `Origin: https://www.s-kaupat.fi`, `Referer: https://www.s-kaupat.fi/`, a browser `User-Agent`, `Accept: application/json` (mcp-ruoka lines ~206-222). The repo plugin sends only a custom UA and Content-Type; unverified whether CloudFront accepts that from the cluster. A README in nuuttikat/ylivieska-tarjoukset says some S-kaupat stores do not allow automated fetching (secondary, UNVERIFIED).

**Rate limits / ToS:** no documented limits found; no public API terms exist (the API is the site's private backend). `https://www.s-kaupat.fi/robots.txt` says `User-agent: *` / `Allow: /` (fetched 2026-11-22). Be polite: cache results per receipt-line text, low concurrency. ToS review: UNVERIFIED (not located).

## 2. Grocy REST API (v4.7.1)

Auth: header `GROCY-API-KEY: <key>` (or same-named query param). Source: `grocy:app.php:102`, `grocy:grocy.openapi.json:5,6064`. Requests with a body must send `Content-Type: application/json` exactly, else HTTP 400 (`controllers/Api/BaseApiController.php:158-163`). Interactive spec is served at `/api` on the instance and mirrored in `grocy.openapi.json`.

**(a) Create product** - `POST /api/objects/products`, JSON body = columns of the `products` table, inserted verbatim via `createRow($requestBody)` (`controllers/Api/GenericEntityApiController.php:53-54`); returns `{"created_object_id": N}`. Table (`migrations/0207.sql:52-84`): required `name` (UNIQUE), `location_id`, `qu_id_purchase`, `qu_id_stock`; optional `default_best_before_days` (int, default 0; `-1` = never expires), `default_best_before_days_after_freezing`, `default_best_before_days_after_open`, `product_group_id`, `shopping_location_id`, `due_type` (1 best-before, 2 expiration), `should_not_be_frozen`, `min_stock_amount`, `description`, etc. `qu_factor_purchase_to_stock` is no longer a column; purchase->stock conversion is a row in `quantity_unit_conversions` (see `StockService.php:677-686`, `POST /api/objects/quantity_unit_conversions` with `product_id, from_qu_id, to_qu_id, factor`). Get ids via `GET /api/objects/locations`, `/api/objects/quantity_units`.

**(b) Add barcode** - `POST /api/objects/product_barcodes` with `{product_id, barcode, qu_id?, amount?, shopping_location_id?, note?}` (schema `ProductBarcode` in `grocy.openapi.json`; table `migrations/0103.sql:12-21`). Delete = `DELETE /api/objects/product_barcodes/{id}`.

**(c) Userfields** - separate call: `PUT /api/userfields/products/{productId}` with `{"kcal_per100g": 123, ...}` (route `routes.php:172`, `GenericEntityApiController.php:279-292`; `UserfieldsService::SetValues` at `services/UserfieldsService.php:103-130` throws if a key is not a defined userfield of the entity). Field names are those in `apps/grocy/install-userfields.php` (`quantity_unit_stock_to_gram_factor`, `kcal_per100g`, `protein_g_per100g`, `fat_g_per100g`, `saturated_fat_g_per100g`, `carbs_g_per100g`, `sugar_g_per100g`, `salt_g_per100g`; type `number-decimal`). The OpenAPI `Product` schema lists a `userfields` object, but the create/edit handlers do not process such a key (they pass the body straight to `createRow`), so do not send it in `POST /objects/products`; behaviour if sent is UNVERIFIED (expected to fail as an unknown column). Use the PUT.

**(d) Add stock** - `POST /api/stock/products/{productId}/add` (or `/stock/products/by-barcode/{barcode}/add`, `routes.php:204,212`). Body: `amount` (required), `best_before_date` (YYYY-MM-DD, optional), `purchased_date`, `price` (per stock unit), `location_id`, `shopping_location_id`, `transaction_type` (default `purchase`), `note`, `stock_label_type` (`controllers/Api/StockApiController.php:85-150`). Returns the stock transaction rows. Invalid/non-ISO date is silently treated as absent (line 104).

**(e) List for fuzzy matching** - `GET /api/objects/products` and `GET /api/objects/product_barcodes` return all rows (plus `userfields` on products, `GenericEntityApiController.php:223-260`). Filtering: repeated `query[]=field<op>value` with ops `= != ~ !~ < > <= >= §`; also `order` and `limit`/`offset` (`grocy.openapi.json:6100-6118`). Simplest: fetch all products + barcodes once, cache, fuzzy match client/backend side. Also `GET /api/stock` for current stock and `GET /api/stock/products/by-barcode/{barcode}` for product details.

**(f) Auth** - see top of section; create keys in the Grocy UI (Manage API keys) or `ApiKeyService::CreateApiKey` (`services/ApiKeyService.php`).

**Can a lookup plugin pre-fill userfields? No.** Evidence:
- `helpers/BaseBarcodeLookupPlugin.php:23-88` only validates `name, location_id, qu_id_purchase, qu_id_stock, __qu_factor_purchase_to_stock, __barcode`.
- `services/StockService.php:609-690` (`ExternalBarcodeLookup`): with `?add=true` it strips `__barcode`, `__qu_factor_purchase_to_stock`, `__image_url`, then does `$this->DB->products()->createRow($productData)` (every remaining key must be a `products` column), then inserts a `product_barcodes` row and, if the QUs differ, a `quantity_unit_conversions` row. Userfields are never written.
- `public/viewjs/components/productpicker.js:257-285`: the UI calls `GET stock/barcodes/external-lookup/{barcode}?add=true`, then redirects to `/product/{id}?flow=InplaceNewProductByExternalBarcodeLookupPlugin`; the product is already saved, the form only edits it. So existing nutrition data from the plugin currently lands only in `description` text (see the plugin). To populate the `*_per100g` userfields, call `PUT /userfields/products/{id}` afterwards (from the PWA backend), or extend nothing in Grocy.
- Also relevant: the lookup is `GET`, requires `MASTER_DATA_EDIT`, and the PWA backend can call it directly with an API key, but it only knows the single configured plugin (`STOCK_BARCODE_LOOKUP_PLUGIN`, `config-dist.php:74`).
- Grocy's own in-browser camera scanner uses `@zxing/library`, not `BarcodeDetector` (`package.json`, `views/layout/default.blade.php:741-742`).

## 3. Browser barcode scanning in a PWA

- Barcode Detection API (`BarcodeDetector`, `detect()`, static `getSupportedFormats()`): formats include `ean_13`, `ean_8`, `upc_a`, `upc_e`. MDN marks it "Limited availability", experimental, secure contexts only, available in Workers. https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- Support data (MDN browser-compat-data `api/BarcodeDetector.json`, main branch, read 2026-11-22): Chrome Android 83+ (no caveat in data); desktop Chrome only ChromeOS/macOS; Firefox none (bugzil.la/1553738); Safari/iOS Safari 17+ **only behind the "Shape Detection API" preference flag**, i.e. not enabled by default, so not usable for an iOS PWA. Whether Android additionally needs Google Play Services components: UNVERIFIED.
- Spec: WICG Shape Detection API, https://wicg.github.io/shape-detection-api/#barcode-detection-api (draft, not a W3C standard).
- Fallback: `barcode-detector` npm ponyfill/polyfill by Sec-ant (ZXing-C++ via WASM; supports `ean_13`, `ean_8`; same API shape): https://github.com/Sec-ant/barcode-detector. Alternative: `@zxing/library` (what Grocy itself uses). Pattern: use native `BarcodeDetector` when `getSupportedFormats()` includes `ean_13`, else the ponyfill.
- `getUserMedia` (camera) needs a secure context (HTTPS, or localhost): MDN states the secure-context requirement for the API above; the same holds for `getUserMedia` (https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia - stated from MDN knowledge, not re-fetched; UNVERIFIED this session).

## 4. Do product defaults apply when adding stock without a date? Yes (API path)

`services/StockService.php:112-177` (`AddProduct`): if `best_before_date` is null (omitted or non-ISO in the request) the date is computed:
1. if the freezing feature flag is on, a `location_id` is given and that location `is_freezer`, and `default_best_before_days_after_freezing >= -1`: use that (`-1` -> 2999-12-31, else today + N days);
2. else `default_best_before_days == -1` -> `2999-12-31`;
3. else `default_best_before_days > 0` -> today + N days;
4. else (0) -> **today**.

Caveats: the API does not fall back to the product's default `location_id` when `location_id` is omitted for the date logic, and the stock entry location when omitted is resolved elsewhere (not traced here, UNVERIFIED). The UI form does the equivalent client-side (`public/viewjs/purchase.js:459-473`). Defaults only exist if set on the product at creation (`POST /objects/products`), so set `default_best_before_days` explicitly; with 0 an omitted date silently becomes today (instantly due). `GROCY_FEATURE_FLAG_STOCK_PRODUCT_FREEZING` status on this instance was not checked.

## Implications for the design

- Name search against S-kaupat needs the persisted-query hash (extract with a headless browser, cache, refresh on `PERSISTED_QUERY_NOT_FOUND`) and browser-like headers; the API was 403 from the sandbox, so prototype from the cluster/home network first. The existing EAN `product(id)` query already works and is the safest piece.
- Receipt import: search each truncated name with `RemoteFilteredProducts`, show top candidates with price + unit price for confirmation (fuzzy matching against receipt price helps), and keep a local alias table (receipt text -> EAN/Grocy product) so each line is resolved once.
- New product creation = 3 calls: `POST /objects/products` (with location, QUs, `default_best_before_days`), `POST /objects/product_barcodes`, `PUT /userfields/products/{id}`; add a conversion row if pack != stock unit. Do not rely on the lookup plugin for userfields.
- Map `hierarchyPath` top level to location ids (fridge/freezer/pantry) and to `default_best_before_days` (and `_after_freezing` for freezer); allow override in the UI; the "sticky location" is a PWA-side setting.
- Stocking: send `best_before_date` when scanned/entered; otherwise rely on product defaults, but ensure they are non-zero.
- Scanner: native `BarcodeDetector` on Android Chrome, WASM ponyfill everywhere else (notably iOS); serve the PWA over HTTPS.
- Keep the Grocy API key server-side in the backend, not in the PWA.

## Sources

- Repo: `apps/grocy/SKaupatBarcodeLookupPlugin.php`, `apps/grocy/install-userfields.php`
- Grocy v4.7.1: https://github.com/grocy/grocy/tree/v4.7.1 (`services/StockService.php`, `controllers/Api/StockApiController.php`, `controllers/Api/GenericEntityApiController.php`, `helpers/BaseBarcodeLookupPlugin.php`, `public/viewjs/components/productpicker.js`, `public/viewjs/purchase.js`, `routes.php`, `grocy.openapi.json`, `migrations/0207.sql`, `migrations/0103.sql`, `config-dist.php`)
- linuxserver image tags: https://hub.docker.com/v2/repositories/linuxserver/grocy/tags ; https://github.com/linuxserver/docker-grocy/releases
- https://github.com/p18a/mcp-ruoka/blob/ef37b32d5fc8ad127a49787454b873912a7f72a2/src/browser/s-kaupat.ts
- https://github.com/aapokat/JKL_Tarjoukset (commit be9ef0e; `site/collectors/s-kaupat.js`, README)
- https://github.com/nuuttikat/ylivieska-tarjoukset (secondary, automation note)
- https://www.s-kaupat.fi/robots.txt
- https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
- https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json
- https://wicg.github.io/shape-detection-api/#barcode-detection-api
- https://github.com/Sec-ant/barcode-detector
