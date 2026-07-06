// App-facing version string (shown in Settings), semver incl. pre-release tags.
//
// NOTE: the update-authority copy lives in sw.js — a browser only ships an
// update when sw.js's own bytes change, so the cache/version there is what
// actually rolls users onto a new build. On release, bump all three together:
// this file, sw.js's APP_VERSION, and package.json's "version".
//
// Pre-release progression: 0.0.1-alpha → 0.0.1-alpha.2 → 0.0.1-beta → 0.0.1-rc.1
// → 0.0.1 → 0.0.2 …
export const APP_VERSION = "0.0.1-alpha.2";
