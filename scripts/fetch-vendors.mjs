// Regenerate js/vendors.js — the Matter vendor ID → manufacturer-name map — from
// the CSA Distributed Compliance Ledger (the authoritative vendor registry).
// The list is small (~450 vendors) and changes rarely, so we bundle a snapshot
// for fully-offline lookups rather than hitting the network at runtime.
//
// Usage: node scripts/fetch-vendors.mjs   (re-run occasionally to refresh)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = "https://on.dcl.csa-iot.org/dcl/vendorinfo/vendors";
const res = await fetch(`${BASE}?pagination.limit=5000`);
if (!res.ok) throw new Error(`DCL fetch failed: ${res.status}`);
const { vendorInfo } = await res.json();

const map = {};
for (const v of vendorInfo) {
  const name = v.vendorName?.trim();
  if (name) map[v.vendorID] = name;
}
const ids = Object.keys(map)
  .map(Number)
  .sort((a, b) => a - b);
const body = ids.map((id) => `  ${id}: ${JSON.stringify(map[id])},`).join("\n");
const date = new Date().toISOString().slice(0, 10);

const out = `// Matter vendor ID → manufacturer name.
// GENERATED bundled snapshot of the CSA Distributed Compliance Ledger vendor
// registry (${BASE}), so lookups work fully offline.
// Regenerate with \`node scripts/fetch-vendors.mjs\`.
// ${date} · ${ids.length} vendors.
const VENDORS = {
${body}
};

// 0xFFF1–0xFFF4 are reserved TEST vendor IDs — not real manufacturers.
export function isTestVendor(vid) {
  return vid >= 0xfff1 && vid <= 0xfff4;
}

// Manufacturer name for a decoded Matter vendorId, or null if unknown/test.
export function vendorName(vid) {
  if (vid == null || isTestVendor(vid)) return null;
  return VENDORS[vid] ?? null;
}
`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(join(root, "js/vendors.js"), out);
console.log(`wrote js/vendors.js — ${ids.length} vendors (${date})`);
