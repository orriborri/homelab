## Problem Statement

Stocking Grocy is slow. For every new product I retype nutrition values, then enter a best-before date and pick a location by hand, one item at a time. Grocy's forms are built for one product at a time, so doing a whole cupboard (or a whole shopping trip) is tedious. Receipts from S-market list what I bought but carry only truncated names, counts and prices, with no barcodes, so I cannot use them to pre-populate the system.

## Solution

A small installable web app (PWA) with a tiny backend, deployed alongside Grocy, that writes to Grocy through its REST API. Grocy stays the database and the place for recipes and nutrition.

- **Scan mode:** each item is scan EAN, confirm date, next. Every product goes to the Kitchen location for now; choosing a location per scan session comes later. Unknown EANs are created automatically from a store catalogue lookup.
- **Receipt import:** paste a receipt, get proposed product matches (by name and price), review them, then create products and stock.
- Products are created with sensible defaults (Kitchen location, best-before days, nutrition values, pack/gram units); best-before days are derived from the catalogue category.

## User Stories

1. As a shopper, I want every scanned item to go to the Kitchen location by default, so that I never pick a location while stocking.
2. As a shopper, I want scanning an EAN to focus the date field with a default already filled, so that I only press Enter for the common case.
3. As a shopper, I want an unknown EAN to be created automatically from the store catalogue, so that I never leave scan mode to fill in a product form.
4. As a shopper, I want new products to get nutrition values per 100 g filled in, so that recipe nutrition totals work without retyping.
5. As a shopper, I want the default location to be configurable in one place, so that adding more locations later is a small change.
6. As a shopper, I want new products to get a default best-before period from their category, so that the date is pre-filled and I only correct it when the pack says otherwise.
7. As a shopper, I want a product with a known package weight to be stocked in grams with a pack conversion, so that stock and nutrition use the same unit.
8. As a shopper, I want to scan with my phone camera, so that I do not need a hardware scanner.
9. As a shopper, I want scanning to work on both Android and iPhone, so that the device I hold does not matter.
10. As a shopper, I want to paste a receipt and see each line matched to a product, so that I can stock a whole trip without scanning.
11. As a shopper, I want non-product receipt lines (deposit, pickup fee, packaging fee, picking fee) ignored, so that they do not become products.
12. As a shopper, I want multi-count lines (`N KPL`) turned into the right amount, so that quantities are correct.
13. As a shopper, I want weighed produce (`KG` lines) handled explicitly (added in grams or skipped), so that loose fruit and vegetables behave predictably.
14. As a shopper, I want each receipt line to show a confident match, an ambiguous match with candidates, or no match, so that I know where to look.
15. As a shopper, I want the receipt price used to choose between similar candidates, so that the right pack size is picked.
16. As a shopper, I want to review and correct matches before anything is written, so that wrong products are never created.
17. As a shopper, I want a confirmed receipt name remembered, so that the same line matches automatically next time.
18. As a shopper, I want receipt names that match products I already have to be recognised, so that I do not get duplicates.
19. As a shopper, I want to adjust the best-before date per receipt line (or accept defaults), so that imported stock has correct dates.
20. (Future) As a shopper, I want to print a QR code for each laatikko (box), so that I can label the physical boxes.
21. (Future) As a shopper, I want scanning a laatikko QR to set the current location, so that I can stock a whole box in one pass.
22. As a shopper, I want a clear message when the store catalogue is unreachable, so that I can fall back to manual entry.
23. As a shopper, I want to use K-ruoka as a catalogue source as well as S-kaupat, so that products from either chain are recognised.
24. As the operator, I want the Grocy API key stored as an encrypted secret, so that no credential is committed.
25. As the operator, I want the app to be reachable only after login, so that holding a Grocy write key does not expose my data.
26. As the operator, I want the app deployed through Flux like other apps, so that it follows the repo's conventions.
27. As the operator, I want the catalogue provider isolated behind one interface, so that a changed or blocked upstream API only breaks one place.

## Implementation Decisions

- **Shape:** a PWA frontend plus a small backend in one deployable app. The backend is required because the catalogue APIs block plain browser requests; the backend makes those calls and Grocy calls.
- **Stack:** Node backend with a plain HTML/JS frontend, no framework.
- **Grocy remains the system of record.** The backend uses the Grocy REST API with an API key: create product, add barcode, set userfields, add stock, list products and barcodes.
- **Nutrition values cannot come through the existing barcode lookup plugin** (its output does not populate userfields). The backend sets them with a separate userfields update after creating the product. The existing plugin stays for Grocy's own add-product flow.
- **Product defaults at creation:** location is a single configured default (Kitchen); default best-before days come from category, units Pack and Gram with a conversion when an explicit package weight exists (reusing the existing plugin's weight rules). Default best-before must be set at creation because a default of 0 means "today" and no stock date then falls back to it.
- **Category mapping:** catalogue category path maps to a best-before default only. Mapping category to location (fridge, freezer, pantry) is deferred with the locations feature. If no category is available, use the configured fallback days.
- **Catalogue provider interface:** two operations: look up by EAN, search by name (returning EAN, name, price, comparison price, category). S-kaupat is the first provider, K-ruoka the second. Each provider is isolated so upstream changes affect one module.
- **S-kaupat search:** earlier research found it is called through persisted-query hashes that change on site redeploy. The first task is to test, from the cluster network, whether plain query text works (decided approach). If it does not, fall back to reading the current hash at runtime. Findings: `docs/research/grocy-pwa-apis.md`.
- **Receipt import:** parse lines into name, count or weight, price; drop known non-product lines; match to existing Grocy products by fuzzy name first, then to catalogue search results using name similarity with price as tiebreaker (with tolerance for campaign prices). Output a review set; nothing is written until confirmed. Persist confirmed receipt-name to product mappings.
- **Locations are a future feature.** For now all items, dry or not, use the one default location, Kitchen. The location is passed as an explicit parameter through the backend so per-session locations can be added without reshaping it.
- **Laatikko QR codes (future):** each laatikko is a Grocy location. A QR encodes the location identity; scanning it sets the sticky location in scan mode. Printing QR codes is a later slice.
- **Scanning:** use the browser BarcodeDetector for EAN-13/EAN-8 where available, with a ZXing-based fallback for browsers without it (notably iOS Safari). Camera access requires HTTPS, which the existing ingress provides.
- **Deployment:** new app registered in the apps kustomization and Flux definition, SOPS-encrypted Grocy API key, ingress behind login. Image build and registry follow whatever the repo already does for custom images (to be checked).
- **Test seam:** one seam, the backend HTTP API: a scan or a pasted receipt goes in, Grocy API calls come out, against a mocked Grocy and mocked catalogue providers.

## Testing Decisions

- Good tests assert external behaviour only: given a barcode or a receipt and mocked catalogue and Grocy responses, assert the Grocy calls made and the proposals returned. They do not assert internal functions.
- The backend HTTP API is the only seam. Cover: unknown EAN creates a product with defaults and userfields; known EAN adds stock with default date; receipt parsing and non-product filtering; count and weight lines; confident, ambiguous and no-match outcomes; price tiebreaker; remembered mappings; catalogue outage.
- Use the sample receipt from the issue conversation as a fixture (with card details removed).
- Prior art: `debug/test-grocy-weight.php` mocks the catalogue response and asserts the lookup result. Follow the same approach (deterministic mocked upstream, no database writes).
- Scan-mode UI and camera behaviour have no automated seam and are checked manually on a real phone.

## Out of Scope

- Replacing Grocy's own UI, recipes or meal planning.
- Multiple locations, per-category locations, and laatikko QR codes: scanning, printing and generating them (later slices).
- Logging in to store accounts or importing receipts directly from S-account or K-account.
- Retroactively fixing stock and units of existing products.
- Tracking loose produce per pack.

## Further Notes

- **Blocking question:** whether S-kaupat search works with plain query text from the cluster network. It could not be tested from the dev sandbox (403). Test first; the receipt-import slice depends on the answer.
- **K-ruoka:** no research has been done yet on its product search API. It needs its own research task before it can be built.
- **Open inputs:** whether scanning is mainly on iPhone or Android, and the exact name of the Kitchen location in Grocy.
- Suggested slicing: (1) cluster test of S-kaupat search, (2) backend with EAN scan and product creation, (3) scan-mode PWA, (4) receipt import, (5) K-ruoka provider, (6, future) locations and laatikko QR scanning and printing.
