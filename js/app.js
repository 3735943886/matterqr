// MatterQR entry point. Wires the DB, store, i18n, rendering and actions.
// The server is nothing but a static host; all logic lives here in the client.

import { qs, toast, h } from "./dom.js";
import { initI18n, onLangChange, applyDom, t } from "./i18n.js";
import { createDb } from "./db.js";
import { initStore, reload, onChange, getState } from "./store.js";
import { renderList } from "./render.js";
import { renderFilters, initFilters } from "./filters.js";
import { renderSort, initSort } from "./sort.js";
import { openScanModal } from "./scan.js";
import { openSettingsModal } from "./settings-modal.js";
import { openBackupModal } from "./backup.js";
import { startSync, setSyncBadge } from "./sync.js";
import { initTheme } from "./theme.js";

// iOS Safari still allows two-finger page pinch-zoom even with touch-action set,
// and it warps the fixed layout. Block Safari's pinch gesture events globally.
// The photo viewer zooms via Pointer Events, not these, so it's unaffected.
["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }),
);

// Block double-tap-to-zoom directly. touch-action:manipulation should cover it
// but Safari ignores it on some elements (e.g. the sticky, backdrop-blurred
// header), so catch it at the source: preventDefault a second touchend within
// 300ms. Text fields are exempt so double-tap-to-select still works there.
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    const doubleTap = now - lastTouchEnd <= 300;
    lastTouchEnd = now;
    if (doubleTap && !e.target.closest?.("input, textarea, [contenteditable]")) e.preventDefault();
  },
  { passive: false },
);

async function main() {
  initTheme(); // keep the pre-painted theme in sync + follow system changes
  // Best-effort durable storage (helps on browsers that honor it; iOS ignores).
  navigator.storage?.persist?.().catch(() => {});

  const db = createDb(window.PouchDB, "matterqr");
  await db.ensureSeed();
  await db.migrateTypes(); // bring pre-standard installs up to the Matter type set
  initStore(db);
  await initI18n();

  // Re-render on any data change.
  onChange(() => {
    renderList();
    renderFilters();
    renderSort();
  });

  initFilters();
  initSort();
  await reload();

  // Re-apply translations + re-render when the language changes.
  onLangChange(() => {
    applyDom();
    initFilters();
    renderFilters();
    renderSort();
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
  hideSplash();
}

// Fade out and remove the first-run splash once the app is ready (or errored).
function hideSplash() {
  const splash = qs("#splash");
  if (!splash) return;
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 400);
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

  // Poll for a new deploy so a long-lived (never-restarted) app still notices:
  // the browser only auto-checks sw.js on navigation. The real trigger is
  // regaining focus (fires immediately when the user returns to the app); the
  // interval is just a slow backstop for an app left open and visible for a
  // long time. update() re-fetches sw.js bypassing the HTTP cache; a changed
  // build fires updatefound → the prompt.
  const POLL_MS = 6 * 60 * 60 * 1000; // 6h backstop
  let lastCheck = 0;
  const check = () => {
    const now = Date.now();
    if (now - lastCheck < 60_000) return; // throttle bursts (e.g. focus toggling)
    lastCheck = now;
    reg.update().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
  setInterval(check, POLL_MS);
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
  hideSplash(); // don't trap the user behind the splash on a fatal error
});
