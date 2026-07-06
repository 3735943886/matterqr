// Run: node --test tests/catalog.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATALOG_UPDATED } from "../js/catalog.js";

test("catalog snapshot is a non-empty list of {t,b,c}", () => {
  assert.ok(Array.isArray(CATALOG));
  assert.ok(CATALOG.length > 1000, "expected the full catalog");
  const p = CATALOG[0];
  assert.equal(typeof p.t, "string");
  assert.ok(p.t.length > 0);
  assert.ok("b" in p && "c" in p);
});

test("CATALOG_UPDATED is a YYYY-MM-DD date", () => {
  assert.match(CATALOG_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
});

test("a well-known product is searchable by brand substring", () => {
  const hits = CATALOG.filter((p) => `${p.t} ${p.b}`.toLowerCase().includes("nanoleaf"));
  assert.ok(hits.length > 0);
});
