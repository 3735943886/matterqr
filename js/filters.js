// Filter bar: search box + location/type/status chip rows with live counts.

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";
import { getState, setFilter, facetCounts } from "./store.js";

function chip(label, active, count, onClick) {
  const body =
    count == null
      ? [label]
      : [label, h("span", { class: active ? "ml-1.5 opacity-80" : "ml-1.5 text-slate-400 dark:text-slate-500" }, count)];
  return h(
    "button",
    {
      class:
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition " +
        (active
          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
          : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"),
      onClick,
    },
    body,
  );
}

// One horizontally-scrollable row per facet. Empty categories are hidden so the
// bar stays compact — only values that actually apply to the current set show.
function facetRow(kind, filterKey, groupLabel) {
  const { filters, cats } = getState();
  const counts = facetCounts(kind);
  const active = filters[filterKey];
  const row = h("div", {
    class: "no-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3",
  });

  row.append(
    h("span", { class: "shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" }, groupLabel),
  );
  row.append(chip(t("filter.all"), !active, null, () => setFilter({ [filterKey]: null })));

  // "Unassigned" pseudo-value for locations.
  if (kind === "loc") {
    const c = counts.get("__unassigned__") || 0;
    if (c || active === "__unassigned__") {
      row.append(
        chip(t("filter.unassigned"), active === "__unassigned__", c, () =>
          setFilter({ [filterKey]: "__unassigned__" }),
        ),
      );
    }
  }

  for (const cat of cats[kind]) {
    const c = counts.get(cat.id) || 0;
    if (!c && active !== cat.id) continue; // hide categories with nothing to show
    row.append(chip(cat.name, active === cat.id, c, () => setFilter({ [filterKey]: cat.id })));
  }
  return row;
}

export function renderFilters() {
  const host = qs("#filter-chips");
  host.replaceChildren(
    facetRow("loc", "loc", t("filter.location")),
    facetRow("type", "type", t("filter.type")),
    facetRow("status", "status", t("filter.status")),
  );
}

export function initFilters() {
  const search = qs("#search");
  search.value = getState().filters.q || "";
  let deb;
  search.addEventListener("input", () => {
    clearTimeout(deb);
    deb = setTimeout(() => setFilter({ q: search.value.trim() }), 150);
  });
}
