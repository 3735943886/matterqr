// Run: node --test tests/vendors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorName, isTestVendor } from "../js/vendors.js";

test("resolves known Matter vendor IDs to names", () => {
  assert.equal(vendorName(4447), "Aqara");
  assert.equal(vendorName(1), "Panasonic");
});

test("test vendor IDs (0xFFF1–0xFFF4) resolve to no name", () => {
  for (const vid of [0xfff1, 0xfff2, 0xfff3, 0xfff4]) {
    assert.equal(isTestVendor(vid), true);
    assert.equal(vendorName(vid), null);
  }
  assert.equal(isTestVendor(4447), false);
});

test("unknown / missing vendor IDs return null", () => {
  assert.equal(vendorName(999999), null);
  assert.equal(vendorName(null), null);
  assert.equal(vendorName(undefined), null);
});
