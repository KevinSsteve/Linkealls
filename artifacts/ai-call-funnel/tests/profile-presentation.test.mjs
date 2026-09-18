import test from "node:test";
import assert from "node:assert/strict";
import { getCatalogVisibility } from "../src/lib/profilePresentation.ts";
import { sharePublicProfile } from "../src/lib/shareProfile.ts";

test("an enabled empty catalog is public, not inactive", () => {
  const status = getCatalogVisibility({ name: "Negócio", catalogEnabled: true, offerings: [] });
  assert.equal(status.isPublic, true);
  assert.equal(status.label, "Catálogo visível");
  assert.match(status.description, /sem produtos/);
});

test("disabled and unnamed businesses are never advertised as public", () => {
  const hidden = getCatalogVisibility({ name: "Negócio", catalogEnabled: false, offerings: [{}] });
  assert.equal(hidden.kind, "hidden");
  assert.equal(hidden.isPublic, false);
  const unnamed = getCatalogVisibility({ name: "  ", catalogEnabled: true, offerings: [{}] });
  assert.equal(unnamed.kind, "incomplete");
  assert.equal(unnamed.isPublic, false);
});

const data = { title: "Negócio", url: "https://example.test/negocio" };

test("native sharing reports success without copying", async () => {
  const result = await sharePublicProfile(data, {
    share: async (value) => assert.deepEqual(value, data),
    copy: async () => assert.fail("must not copy after sharing"),
  });
  assert.equal(result, "shared");
});

test("cancelling native sharing is not an error or a clipboard action", async () => {
  const result = await sharePublicProfile(data, {
    share: async () => { throw new DOMException("Cancelled", "AbortError"); },
    copy: async () => assert.fail("must not copy after cancellation"),
  });
  assert.equal(result, "cancelled");
});

test("sharing falls back to confirmed copy", async () => {
  const result = await sharePublicProfile(data, {
    share: async () => { throw new Error("Unavailable"); },
    copy: async (url) => assert.equal(url, data.url),
  });
  assert.equal(result, "copied");
});

test("blocked or missing clipboard requests a visible manual copy fallback", async () => {
  assert.equal(await sharePublicProfile(data, {}), "manual");
  assert.equal(await sharePublicProfile(data, {
    copy: async () => { throw new Error("Clipboard denied"); },
  }), "manual");
});