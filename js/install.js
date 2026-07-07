// "Install as an app" prompt. Replaces the old thin top banner with a proper
// modal that nudges users to install the PWA.
//   • Chrome/Edge/Android: the browser fires beforeinstallprompt — we capture it
//     and offer a real "Install" button that triggers the native prompt.
//   • iOS Safari: there is no such event; installing is manual, so we show
//     illustrated Share → "Add to Home Screen" steps instead.
// It shows once per browser session (sessionStorage) while not yet installed,
// so it keeps nudging on future launches but doesn't nag within a session.

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";
import { openModal } from "./modal.js";

const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !window.MSStream;

// Captured at module load: beforeinstallprompt can fire before init runs.
let deferredPrompt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

// Small stroked SVG icon (inherits currentColor, so it's theme-aware).
function icon(paths) {
  const NS = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(NS, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("class", "h-5 w-5");
  for (const d of paths) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    el.appendChild(p);
  }
  return el;
}
const shareIcon = () => icon(["M12 3v13", "M8 7l4-4 4 4", "M6 13v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5"]);
const addBoxIcon = () => icon(["M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", "M12 9v6", "M9 12h6"]);

export function openInstallModal() {
  const iOS = isIOS();

  const logo = h(
    "div",
    { class: "mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl", style: "background:linear-gradient(145deg,#10b981,#059669)" },
    "🔳",
  );
  const pitch = h("p", { class: "text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300" }, t("install.body"));

  const step = (glyph, text) =>
    h("div", { class: "flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 dark:bg-slate-800" }, [
      h("span", { class: "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200" }, glyph),
      h("span", { class: "text-sm" }, text),
    ]);

  // Native install button when the browser supports it (Android/desktop Chrome).
  const installBtn =
    !iOS && deferredPrompt
      ? h(
          "button",
          {
            class: "w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[.99]",
            onClick: async () => {
              const p = deferredPrompt;
              deferredPrompt = null;
              m.close();
              try {
                p.prompt();
                await p.userChoice;
              } catch {
                /* user dismissed */
              }
            },
          },
          "📲 " + t("install.cta"),
        )
      : null;

  // iOS: manual steps (Share → Add to Home Screen).
  const iosSteps = iOS ? h("div", { class: "space-y-2" }, [step(shareIcon(), t("install.ios.step1")), step(addBoxIcon(), t("install.ios.step2"))]) : null;

  const body = h("div", { class: "space-y-4" }, [logo, pitch, installBtn, iosSteps]);
  const later = h("button", { class: "rounded-lg px-4 py-2 text-sm text-slate-500 dark:text-slate-400", onClick: () => m.close() }, t("install.later"));
  const m = openModal({ title: t("install.title"), body, actions: [later] });
  return m;
}

export function initInstallPrompt() {
  if (isStandalone()) return; // already installed — nothing to do

  const showOnce = () => {
    if (isStandalone()) return;
    if (sessionStorage.getItem("installShown")) return;
    sessionStorage.setItem("installShown", "1");
    openInstallModal();
  };

  if (isIOS()) {
    // No beforeinstallprompt on iOS; show the manual steps once the splash clears.
    setTimeout(showOnce, 1200);
  } else if (deferredPrompt) {
    setTimeout(showOnce, 1200); // event already arrived
  } else {
    // Otherwise wait for the browser to say it's installable, then show with the button.
    window.addEventListener("beforeinstallprompt", () => setTimeout(showOnce, 800), { once: true });
  }
}
