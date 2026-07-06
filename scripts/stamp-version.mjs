// Single source of truth for the app version = package.json "version".
// This script propagates it into the two files that must embed the literal:
//   • sw.js         — the SW update authority; its bytes must change for a new
//                     build to roll out to installed clients.
//   • js/version.js — the copy the app imports for the Settings display.
// Never hand-edit the APP_VERSION literals; bump package.json and run this.
//
// Usage:  npm run stamp        (after editing package.json "version")
//         npm version <x>      (bumps package.json, then stamps automatically)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!version) throw new Error("package.json has no version");

const targets = [
  { file: "sw.js", re: /(const APP_VERSION = ")[^"]*(")/ },
  { file: "js/version.js", re: /(export const APP_VERSION = ")[^"]*(")/ },
];

let changed = 0;
for (const { file, re } of targets) {
  const path = join(root, file);
  const src = readFileSync(path, "utf8");
  if (!re.test(src)) throw new Error(`APP_VERSION literal not found in ${file}`);
  const next = src.replace(re, `$1${version}$2`);
  if (next !== src) {
    writeFileSync(path, next);
    changed++;
  }
  console.log(`  ${file} → ${version}`);
}
console.log(changed ? `stamped ${changed} file(s) to ${version}` : `already at ${version}`);
