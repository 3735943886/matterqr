// Minimal i18n: ko (default) + en fallback. No build step, no dependency.
// Flat namespaced keys in locales/<lang>.json. Markup hooks:
//   data-i18n="key"            → textContent
//   data-i18n-attr="ph:key"    → attribute (e.g. placeholder)
// Paths are resolved against document.baseURI so it works under a GitHub Pages
// subpath (/matterqr/) with no absolute URLs.

let messages = {};
let fallback = {};
let current = "en";
const listeners = new Set();

async function load(lang) {
  const url = new URL(`./locales/${lang}.json`, document.baseURI);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locale ${lang} not found`);
  return res.json();
}

export async function initI18n() {
  fallback = await load("en").catch(() => ({}));
  // English is the default UI language; Korean is available via the selector.
  current = localStorage.getItem("lang") || "en";
  messages = current === "en" ? fallback : await load(current).catch(() => fallback);
  document.documentElement.lang = current;
  applyDom();
}

export function t(key, vars) {
  let s = messages[key] ?? fallback[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function getLang() {
  return current;
}

export async function setLang(lang) {
  current = lang;
  localStorage.setItem("lang", lang);
  messages = lang === "en" ? fallback : await load(lang).catch(() => fallback);
  document.documentElement.lang = lang;
  applyDom();
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn) {
  listeners.add(fn);
}

/** Fill every data-i18n / data-i18n-attr node under root. */
export function applyDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":").map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
