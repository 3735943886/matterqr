// Regenerate js/catalog.js — a slim, text-only snapshot of the MatterCatalog
// product list — for offline model-name autocomplete. The browser can't fetch
// mattercatalog.com directly (no CORS), so we bundle a snapshot here (server
// side, like curl) and the app reads it same-origin. Images are intentionally
// excluded: they live on dozens of external hosts (online-only, CORS, privacy).
//
// Usage: node scripts/fetch-catalog.mjs   (the weekly-ish workflow runs this)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://mattercatalog.com/api";

const stats = await (await fetch(`${API}/stats.json`)).json();
const lastUpdated = stats?.data?.lastUpdated ?? "";

const res = await fetch(`${API}/products.json`);
if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
const { data } = await res.json();

// Slim to just what name-search needs; drop blanks; de-dupe identical rows.
const seen = new Set();
const items = [];
for (const p of data) {
  const t = (p.title ?? "").trim();
  if (!t) continue;
  const b = (p.brand ?? "").trim();
  const c = (p.category ?? "").trim();
  const key = `${t}|${b}|${c}`;
  if (seen.has(key)) continue;
  seen.add(key);
  items.push({ t, b, c });
}
// Stable order (by title, then brand) so regeneration only diffs on real change.
items.sort((a, b) => a.t.localeCompare(b.t) || a.b.localeCompare(b.b));

const rows = items.map((i) => `  ${JSON.stringify([i.t, i.b, i.c])},`).join("\n");
const out = `// GENERATED slim snapshot of the MatterCatalog product list, for offline
// model-name autocomplete. Regenerate with \`node scripts/fetch-catalog.mjs\`.
// Source: ${API}/products.json · updated ${lastUpdated} · ${items.length} products.
// Each row is [title, brand, category]; images are intentionally excluded.
export const CATALOG_UPDATED = ${JSON.stringify(lastUpdated)};
export const CATALOG = [
${rows}
].map(([t, b, c]) => ({ t, b, c }));
`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(join(root, "js/catalog.js"), out);
console.log(`wrote js/catalog.js — ${items.length} products (updated ${lastUpdated})`);
