// Filter bar: search box + location/type/status chip rows with live counts.

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";
import { getState, setFilter, facetCounts } from "./store.js";

function chip(label, active, count, onClick) {
  return h(
    "button",
    {
      class:
        "rounded-full border px-3 py-1 text-xs font-medium transition " +
        (active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"),
      onClick,
    },
    count == null ? label : `${label} ${count}`,
  );
}

function facetRow(kind, filterKey, allLabel) {
  const { filters, cats } = getState();
  const counts = facetCounts(kind);
  const active = filters[filterKey];
  const row = h("div", { class: "flex flex-wrap gap-1.5" });

  row.append(chip(allLabel, !active, null, () => setFilter({ [filterKey]: null })));

  // "Unassigned" pseudo-value for locations.
  if (kind === "loc") {
    const c = counts.get("__unassigned__") || 0;
    if (c) {
      row.append(
        chip(t("filter.unassigned"), active === "__unassigned__", c, () =>
          setFilter({ [filterKey]: "__unassigned__" }),
        ),
      );
    }
  }

  for (const cat of cats[kind]) {
    const c = counts.get(cat.id) || 0;
    row.append(chip(cat.name, active === cat.id, c, () => setFilter({ [filterKey]: cat.id })));
  }
  return row;
}

export function renderFilters() {
  const host = qs("#filter-chips");
  host.replaceChildren(
    facetRow("loc", "loc", t("filter.location") + " · " + t("filter.all")),
    facetRow("type", "type", t("filter.type") + " · " + t("filter.all")),
    facetRow("status", "status", t("filter.status") + " · " + t("filter.all")),
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
