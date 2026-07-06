// Filter UI: an always-visible search box + a compact "Filters" button that
// opens a bottom sheet with the location/type/status facets. Keeping the facets
// in a sheet (instead of three permanent chip rows) frees up the list area; the
// button shows a badge with the active-facet count.

import { h, qs } from "./dom.js";
import { t } from "./i18n.js";
import { openModal } from "./modal.js";
import { getState, setFilter, facetCounts, filteredDevices, onChange, offChange } from "./store.js";

const FACET_FILTERS = ["loc", "type", "status"];

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
          : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700 dark:hover:ring-slate-600"),
      onClick,
    },
    body,
  );
}

// One labelled facet block inside the sheet. Chips wrap (there's vertical room
// in the sheet) and empty categories are hidden, so only applicable values show.
function facetSection(kind, filterKey, label) {
  const { filters, cats } = getState();
  const counts = facetCounts(kind);
  const active = filters[filterKey];
  const chips = h("div", { class: "flex flex-wrap gap-1.5" });

  chips.append(chip(t("filter.all"), !active, null, () => setFilter({ [filterKey]: null })));

  if (kind === "loc") {
    const c = counts.get("__unassigned__") || 0;
    if (c || active === "__unassigned__") {
      chips.append(
        chip(t("filter.unassigned"), active === "__unassigned__", c, () => setFilter({ [filterKey]: "__unassigned__" })),
      );
    }
  }

  for (const cat of cats[kind]) {
    const c = counts.get(cat.id) || 0;
    if (!c && active !== cat.id) continue;
    chips.append(chip(cat.name, active === cat.id, c, () => setFilter({ [filterKey]: cat.id })));
  }

  return h("div", { class: "space-y-2" }, [
    h("div", { class: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, label),
    chips,
  ]);
}

function activeCount() {
  const { filters } = getState();
  return FACET_FILTERS.filter((k) => filters[k] != null).length;
}

function clearFacets() {
  setFilter({ loc: null, type: null, status: null });
}

// Update the collapsed bar (badge + Clear visibility) to reflect active facets.
export function renderFilters() {
  const badge = qs("#filter-count");
  const clear = qs("#btn-filters-clear");
  const n = activeCount();
  if (badge) {
    badge.textContent = n;
    badge.hidden = n === 0;
  }
  if (clear) clear.hidden = n === 0;
}

function openFilterSheet() {
  const rows = h("div", { class: "space-y-5" });
  const apply = h(
    "button",
    { class: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500" },
    "",
  );

  const draw = () => {
    rows.replaceChildren(
      facetSection("loc", "loc", t("filter.location")),
      facetSection("type", "type", t("filter.type")),
      facetSection("status", "status", t("filter.status")),
    );
    apply.textContent = t("filter.showResults", { n: filteredDevices().length });
  };
  draw();

  // Re-draw the sheet's chips live as facets change (it's detached from the
  // main onChange render path), and drop the subscription when it closes.
  onChange(draw);

  const reset = h(
    "button",
    { class: "mr-auto rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800", onClick: clearFacets },
    t("filter.reset"),
  );

  const m = openModal({
    title: t("filter.title"),
    body: rows,
    actions: [reset, apply],
    onClose: () => offChange(draw),
  });
  apply.addEventListener("click", () => m.close());
}

export function initFilters() {
  const search = qs("#search");
  search.value = getState().filters.q || "";
  let deb;
  search.addEventListener("input", () => {
    clearTimeout(deb);
    deb = setTimeout(() => setFilter({ q: search.value.trim() }), 150);
  });

  qs("#btn-filters")?.addEventListener("click", openFilterSheet);
  qs("#btn-filters-clear")?.addEventListener("click", clearFacets);
}
