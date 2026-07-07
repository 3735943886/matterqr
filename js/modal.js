// Reusable modal shell. Centered card, internal scroll, safe-area aware,
// and it lifts above the iOS virtual keyboard via visualViewport.

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";

let openCount = 0;

/**
 * openModal({ title, body, actions, onClose }) → { close, panel }
 *   body:    a Node (the modal content)
 *   actions: array of Nodes for the footer (buttons), or null
 */
export function openModal({ title, body, actions = null, onClose, beforeClose } = {}) {
  const root = qs("#modal-root");

  const closeBtn = h(
    "button",
    { class: "rounded-lg p-2 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800", "aria-label": t("action.close") },
    "✕",
  );

  const panel = h(
    "div",
    {
      class:
        "sheet-in flex max-h-[90dvh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900",
      role: "dialog",
      "aria-modal": "true",
    },
    [
      h("div", { class: "flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800" }, [
        h("h2", { class: "mr-auto text-base font-semibold" }, title || ""),
        closeBtn,
      ]),
      h("div", { class: "modal-scroll flex-1 overflow-y-auto px-4 py-4" }, body || ""),
      actions &&
        h("div", { class: "safe-bottom flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800" }, actions),
    ],
  );

  const overlay = h(
    "div",
    {
      class:
        "overlay-in fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4",
    },
    panel,
  );
  // Bottom-sheet feel on phones, centered card on wider screens.
  panel.classList.add("rounded-b-none", "sm:rounded-b-2xl");

  // close(true) forces past beforeClose — used by callers that already committed
  // (e.g. Save/Delete) so they don't trip the "discard changes?" guard.
  let guarding = false;
  async function close(force) {
    if (guarding) return; // a guard prompt is already up
    if (!force && beforeClose) {
      guarding = true;
      let ok;
      try {
        ok = await beforeClose();
      } finally {
        guarding = false;
      }
      if (!ok) return;
    }
    overlay.remove();
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.body.style.overflow = "";
    window.visualViewport?.removeEventListener("resize", onVV);
    document.removeEventListener("keydown", onKey);
    onClose?.();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  // Keep the panel fully visible when the on-screen keyboard shrinks the viewport.
  function onVV() {
    const vv = window.visualViewport;
    panel.style.maxHeight = `${Math.min(vv.height - 16, window.innerHeight * 0.9)}px`;
  }

  closeBtn.addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  window.visualViewport?.addEventListener("resize", onVV);

  openCount++;
  document.body.style.overflow = "hidden";
  root.append(overlay);
  return { close, panel };
}

/** Promise-based yes/no confirm dialog. */
export function confirm(message, { danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      m.close();
      resolve(v);
    };
    const no = h("button", { class: "rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" }, t("confirm.no"));
    const yes = h(
      "button",
      { class: `rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}` },
      t("confirm.yes"),
    );
    no.addEventListener("click", () => finish(false));
    yes.addEventListener("click", () => finish(true));
    const m = openModal({
      title: t("app.title"),
      body: h("p", { class: "text-sm" }, message),
      actions: [no, yes],
      onClose: () => finish(false),
    });
  });
}

/** Small labelled form field wrapper. */
export function field(labelText, control) {
  return h("label", { class: "block space-y-1" }, [
    h("span", { class: "text-xs font-medium text-slate-500" }, labelText),
    control,
  ]);
}
