// Sort control: a pill next to Filters that shows the current sort and opens a
// bottom sheet of options. Re-picking the active option flips its direction.
// Location/Type sorts render as grouped sections (handled in render.js).

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";
import { openModal } from "./modal.js";
import { getSort, setSort } from "./store.js";

// Sort keys in display order, with each key's i18n label.
const OPTIONS = [
  { key: "updated", label: "sort.updated" },
  { key: "created", label: "sort.created" },
  { key: "name", label: "sort.name" },
  { key: "loc", label: "sort.loc" },
  { key: "type", label: "sort.type" },
];
const LABEL = Object.fromEntries(OPTIONS.map((o) => [o.key, o.label]));

// Sensible default direction when switching to a key (time-based → newest first).
export function defaultDir(key) {
  return key === "updated" || key === "created" ? "desc" : "asc";
}

// Reflect the current sort in the pill (label + direction arrow).
export function renderSort() {
  const el = qs("#sort-label");
  if (!el) return;
  const { key, dir } = getSort();
  // Use the small centered triangles (▴/▾), not ↑/↓: Safari renders the arrow
  // glyphs with ink low enough to overflow the pill's bottom edge (looks clipped).
  el.textContent = `${t(LABEL[key] || "sort.updated")} ${dir === "asc" ? "▴" : "▾"}`;
}

function openSortSheet() {
  const { key: curKey, dir: curDir } = getSort();
  const rows = OPTIONS.map((o) => {
    const active = o.key === curKey;
    return h(
      "button",
      {
        type: "button",
        class:
          "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition " +
          (active
            ? "bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
            : "hover:bg-slate-100 dark:hover:bg-slate-800"),
        onClick: () => {
          // New key → its default direction; same key again → flip direction.
          const dir = active ? (curDir === "asc" ? "desc" : "asc") : defaultDir(o.key);
          setSort({ key: o.key, dir });
          m.close();
        },
      },
      [
        h("span", { class: "flex-1" }, t(o.label)),
        h("span", { class: "text-slate-400" }, active ? (curDir === "asc" ? "▴" : "▾") : ""),
      ],
    );
  });
  const m = openModal({ title: t("sort.title"), body: h("div", { class: "space-y-1" }, rows) });
}

export function initSort() {
  qs("#btn-sort")?.addEventListener("click", openSortSheet);
}
