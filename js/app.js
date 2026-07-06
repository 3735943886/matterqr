// MatterQR entry point. Wires the DB, store, i18n, rendering and actions.
// The server is nothing but a static host; all logic lives here in the client.

import { qs, toast } from "./dom.js";
import { initI18n, onLangChange, applyDom, t } from "./i18n.js";
import { createDb } from "./db.js";
import { initStore, reload, onChange, getState } from "./store.js";
import { renderList } from "./render.js";
import { renderFilters, initFilters } from "./filters.js";
import { openScanModal } from "./scan.js";
import { openSettingsModal } from "./settings-modal.js";
import { openBackupModal } from "./backup.js";
import { startSync, setSyncBadge } from "./sync.js";

async function main() {
  // Best-effort durable storage (helps on browsers that honor it; iOS ignores).
  navigator.storage?.persist?.().catch(() => {});

  const db = createDb(window.PouchDB, "matterqr");
  await db.ensureSeed();
  initStore(db);
  await initI18n();

  // Re-render on any data change.
  onChange(() => {
    renderList();
    renderFilters();
  });

  initFilters();
  await reload();

  // Re-apply translations + re-render when the language changes.
  onLangChange(() => {
    applyDom();
    initFilters();
    renderFilters();
    renderList();
    refreshSyncBadge();
  });

  // Header / scan actions.
  qs("#btn-scan").addEventListener("click", () => openScanModal());
  qs("#btn-settings").addEventListener("click", () => openSettingsModal());
  qs("#btn-backup").addEventListener("click", () => openBackupModal());

  setupInstallBanner();

  // Start CouchDB sync if configured.
  const settings = await db.getSettings();
  if (!startSync(db, settings, reload)) setSyncBadge("off");

  // Register the service worker (offline / installable). Relative path so it
  // works under a GitHub Pages subpath.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.__matterqrReady = true; // readiness signal for e2e
}

function refreshSyncBadge() {
  const el = qs("#sync-badge");
  // Keep whatever sync.js last set; only re-label if empty.
  if (el && !el.textContent) setSyncBadge("off");
}

// iOS has no beforeinstallprompt — nudge the user to "Add to Home Screen".
function setupInstallBanner() {
  const banner = qs("#install-banner");
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
  const dismissed = localStorage.getItem("installDismissed") === "1";
  if (isIOS && !standalone && !dismissed) banner.hidden = false;
  qs("#install-dismiss").addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem("installDismissed", "1");
  });
}

main().catch((e) => {
  console.error(e);
  toast(t("err.generic"), "error");
});
