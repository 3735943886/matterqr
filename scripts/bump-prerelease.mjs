// Increment the -alpha.N prerelease number in package.json by one. Used by the
// weekly vendor-refresh workflow so a data-only change still ships as a new
// build (bumping the version changes sw.js via `npm run stamp`, which is what
// makes installed clients notice the update). Run `npm run stamp` afterwards.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));
const m = pkg.version.match(/^(.*-alpha\.)(\d+)$/);
if (!m) {
  console.error(`unexpected version "${pkg.version}" — expected a "…-alpha.N" prerelease`);
  process.exit(1);
}
pkg.version = m[1] + (Number(m[2]) + 1);
writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(`bumped to ${pkg.version}`);
