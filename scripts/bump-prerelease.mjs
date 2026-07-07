// Bump package.json to the next build so a data-only change (or any change)
// still ships: a prerelease bumps its trailing number (…-beta.4 → …-beta.5),
// and a stable release bumps its patch (0.1.0 → 0.1.1) — a data refresh with no
// feature change is exactly a patch. Used by the refresh workflows; run
// `npm run stamp` afterwards to write the new version into sw.js (which is what
// makes installed clients notice the update).
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));

const pre = pkg.version.match(/^(.*-(?:alpha|beta|rc)\.)(\d+)$/);
const rel = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (pre) {
  pkg.version = pre[1] + (Number(pre[2]) + 1);
} else if (rel) {
  pkg.version = `${rel[1]}.${rel[2]}.${Number(rel[3]) + 1}`;
} else {
  console.error(`unexpected version "${pkg.version}" — expected X.Y.Z or a "…-alpha.N/-beta.N/-rc.N" prerelease`);
  process.exit(1);
}

writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(`bumped to ${pkg.version}`);
