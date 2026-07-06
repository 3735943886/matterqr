// MatterQR entry point. Wires the DB, store, i18n, rendering and actions.
// The server is nothing but a static host; all logic lives here in the client.

import { qs, toast, h } from "./dom.js";
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
    navigator.serviceWorker
      .register("./sw.js")
      .then(setupUpdatePrompt)
      .catch(() => {});
  }

  window.__matterqrReady = true; // readiness signal for e2e
}

// Surface a tap-to-refresh prompt when a newer app version is installed and
// waiting. Tapping it tells the waiting worker to take over, then reloads onto
// the new shell. Data (IndexedDB) is untouched by any of this.
function setupUpdatePrompt(reg) {
  let triggered = false;

  const prompt = (worker) => {
    // Ignore the very first install (no existing controller) — that's not an
    // update, and we don't want a "new version" toast on a fresh load.
    if (!worker || !navigator.serviceWorker.controller) return;
    if (qs("#update-toast")) return; // already prompting
    const btn = h(
      "button",
      {
        id: "update-toast",
        class:
          "pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 active:scale-95 dark:bg-white dark:text-slate-900",
        onClick: () => {
          triggered = true;
          btn.disabled = true;
          worker.postMessage("skipWaiting");
        },
      },
      [h("span", {}, "🔄"), h("span", {}, t("update.available"))],
    );
    qs("#toasts").append(btn);
  };

  if (reg.waiting) prompt(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const nw = reg.installing;
    nw?.addEventListener("statechange", () => {
      if (nw.state === "installed") prompt(nw);
    });
  });
  // The new worker activated (after our postMessage) — reload onto it once.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (triggered) window.location.reload();
  });
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
