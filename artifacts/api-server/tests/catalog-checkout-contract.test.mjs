import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.resolve(apiServerDir, "../ai-call-funnel");

async function frontendSource(relativePath) {
  return readFile(path.join(frontendDir, relativePath), "utf8");
}

test("catalog purchase button opens a visible responsive checkout modal", async () => {
  const [catalog, modal, styles] = await Promise.all([
    frontendSource("src/pages/Catalogo.tsx"),
    frontendSource("src/components/BuyModal.tsx"),
    frontendSource("src/index.css"),
  ]);

  // A priced offering must render a real button and pass the selected quantity
  // into the modal state held by the catalog page.
  assert.match(catalog, /const canBuy = Boolean\(businessSlug && offering\.price && parsePriceAoa\(offering\.price\) !== null\)/);
  assert.match(catalog, /className="catalog-primary-action" onClick=\{\(\) => onBuy\(quantity\)\}/);
  assert.match(catalog, /setBuyOffering\(selectedOffering\)/);
  assert.match(catalog, /<BuyModal/);

  // The modal must escape the catalog page's direct-child stacking rule.
  assert.match(modal, /className="catalog-buy-modal-overlay fixed inset-0 z-50 flex items-center justify-center"/);
  assert.match(styles, /\.catalog-page > \.catalog-buy-modal-overlay \{\s*position: fixed !important;\s*z-index: 50 !important;/);

  // Mobile checkout stays usable through a bounded card and an internal scroll.
  assert.match(modal, /maxHeight: "calc\(100svh - 40px\)"/);
  assert.match(modal, /className="overflow-y-auto"/);
});

test("catalog checkout validates the phone and posts to the business-scoped orders route", async () => {
  const [modal, api, routes] = await Promise.all([
    frontendSource("src/components/BuyModal.tsx"),
    frontendSource("src/lib/api.ts"),
    readFile(path.join(apiServerDir, "src/routes/paymentsScoped.ts"), "utf8"),
  ]);

  assert.match(modal, /if \(!\/\^9\\d\{8\}\$\/\.test\(p\)\)/);
  assert.match(modal, /api\.createOrder\(\{/);
  assert.match(modal, /offeringName: offering\.name/);
  assert.match(modal, /quantity: qty/);
  assert.match(modal, /phone: p/);
  assert.match(api, /bRequest<OrderCheckout>\("\/orders", \{ method: "POST"/);
  assert.match(routes, /router\.post\("\/orders", publicRateLimit/);
  assert.match(routes, /createOrderSchema\.safeParse\(req\.body\)/);
});