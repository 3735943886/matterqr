// Optional CouchDB replication. Local PouchDB stays the source of truth; when
// the user configures a remote in Settings we run a live, retrying two-way sync.
// No remote configured → the app is fully local and this module is inert.

import { qs } from "./dom.js";
import { t } from "./i18n.js";

let handle = null;
let remote = null;
let changesFeed = null;

const BADGE = {
  off: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  on: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  paused: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
};

export function setSyncBadge(kind) {
  const el = qs("#sync-badge");
  if (!el) return;
  const label = { off: "sync.off", on: "sync.on", error: "sync.error", paused: "sync.paused" }[kind] || "sync.off";
  el.textContent = kind === "off" ? "◍ " + t(label) : "⟳ " + t(label);
  el.className = `rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[kind] || BADGE.off}`;
}

function remoteURL(base, name = "matterqr") {
  // Accept either a full db URL or a server root; append the db name if missing.
  const clean = base.replace(/\/+$/, "");
  return /\/[a-z0-9._~()$+-]+$/i.test(new URL(clean).pathname) && new URL(clean).pathname !== "/"
    ? clean
    : `${clean}/${name}`;
}

/** Start replication. Returns true if started, false if no/invalid config. */
export function startSync(localDb, settings, onRemoteChange) {
  stopSync();
  if (!settings?.syncEnabled || !settings?.syncUrl) {
    setSyncBadge("off");
    return false;
  }
  const PouchDB = window.PouchDB;
  try {
    const opts = {};
    if (settings.syncUser) opts.auth = { username: settings.syncUser, password: settings.syncPass || "" };
    remote = new PouchDB(remoteURL(settings.syncUrl), opts);
  } catch {
    setSyncBadge("error");
    return false;
  }

  setSyncBadge("on");
  handle = localDb.raw
    .sync(remote, { live: true, retry: true })
    .on("active", () => setSyncBadge("on"))
    .on("paused", (err) => setSyncBadge(err ? "error" : "paused"))
    .on("change", () => onRemoteChange?.())
    .on("denied", () => setSyncBadge("error"))
    .on("error", () => setSyncBadge("error"));

  // Surface remote-originated docs in the UI promptly.
  changesFeed = localDb.raw
    .changes({ since: "now", live: true })
    .on("change", () => onRemoteChange?.());
  return true;
}

export function stopSync() {
  handle?.cancel?.();
  changesFeed?.cancel?.();
  remote?.close?.();
  handle = remote = changesFeed = null;
}

/** One-shot connectivity probe for the Settings "test" button. */
export async function testConnection(settings) {
  const PouchDB = window.PouchDB;
  const opts = {};
  if (settings.syncUser) opts.auth = { username: settings.syncUser, password: settings.syncPass || "" };
  const r = new PouchDB(remoteURL(settings.syncUrl), { ...opts, skip_setup: true });
  try {
    await r.info();
    return true;
  } catch {
    return false;
  } finally {
    r.close?.();
  }
}
