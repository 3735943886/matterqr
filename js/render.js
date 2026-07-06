// Dashboard device list. Renders filtered devices as tappable cards.

import { h, qs, escapeHtml, formatAgo, photoURL } from "./dom.js";
import { t } from "./i18n.js";
import { getState, filteredDevices, catName, getSort } from "./store.js";
import { openDeviceModal } from "./device-modal.js";

const KIND_BADGE = {
  matter_qr: { label: "QR", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  manual: { label: "PIN", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200" },
  other: { label: "•", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

const THUMB = "h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200/70 dark:ring-slate-700/60";

async function loadThumb(imgEl, identity) {
  const db = getState().db;
  const blob = await db.getPhoto(identity).catch(() => null);
  if (blob) imgEl.src = photoURL(blob);
  else
    imgEl.replaceWith(
      h(
        "div",
        {
          class:
            "grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-2xl ring-1 ring-slate-200/70 dark:from-slate-800 dark:to-slate-800/60 dark:ring-slate-700/60",
        },
        "🔲",
      ),
    );
}

// Small neutral pill for the location/status metadata line. `muted` dims the
// value when it's a placeholder (e.g. an unassigned location).
function pill(icon, name, muted = false) {
  return h(
    "span",
    {
      class:
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (muted
          ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"),
    },
    [icon && h("span", { class: "text-[10px]" }, icon), name],
  );
}

function card(d) {
  const badge = KIND_BADGE[d.codeKind] || KIND_BADGE.other;
  const title = d.model || catName("type", d.deviceTypeId) || d.codeRaw || d.identity;
  const typeName = catName("type", d.deviceTypeId);
  const locName = d.locationId ? catName("loc", d.locationId) : t("filter.unassigned");
  const statusName = catName("status", d.statusId);

  const img = h("img", { class: THUMB, alt: "" });
  loadThumb(img, d.identity);

  // Secondary line — device type only. Raw vendor/product IDs live in the modal;
  // on a list card they're noise (and meaningless for manual pairing codes).
  const meta = typeName ? [typeName] : [];

  return h(
    "button",
    {
      class:
        "card-in group flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md hover:ring-slate-300 active:scale-[.99] dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-slate-700",
      onClick: () => openDeviceModal({ device: d }),
    },
    [
      img,
      h("div", { class: "min-w-0 flex-1" }, [
        h("div", { class: "flex min-w-0 items-center gap-2" }, [
          h("span", { class: `shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}` }, badge.label),
          h("span", { class: "min-w-0 truncate font-semibold" }, title),
        ]),
        meta.length ? h("div", { class: "mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" }, meta.join(" · ")) : null,
        h("div", { class: "mt-1.5 flex flex-wrap items-center gap-1" }, [
          pill("📍", locName, !d.locationId),
          statusName && pill(null, statusName),
        ]),
      ]),
      h("div", { class: "flex shrink-0 flex-col items-end gap-1.5 self-stretch" }, [
        h("span", { class: "text-[11px] text-slate-400" }, formatAgo(d.updatedAt, t)),
        h("span", { class: "text-lg leading-none text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400 dark:text-slate-600" }, "›"),
      ]),
    ],
  );
}

// Location/Type sorts render as grouped sections; the rest are flat.
const GROUPED = { loc: true, type: true };

function deviceName(d) {
  return d.model || catName("type", d.deviceTypeId) || d.codeRaw || d.identity;
}

function flatSorted(list, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  const cmp =
    {
      created: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
      name: (a, b) => deviceName(a).localeCompare(deviceName(b), undefined, { sensitivity: "base" }),
    }[key] || ((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || "")); // "updated"
  return [...list].sort((a, b) => cmp(a, b) * mul);
}

function sectionHeader(name, count) {
  return h("div", { class: "mt-3 flex items-baseline gap-2 px-1 first:mt-0" }, [
    h("span", { class: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, name),
    h("span", { class: "text-[11px] text-slate-400" }, count),
  ]);
}

// Group by a category (loc/type); groups ordered by name, items by recency.
function groupedNodes(list, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  const noneLabel = key === "loc" ? t("filter.unassigned") : t("filter.none");
  const groups = new Map();
  for (const d of list) {
    const id = key === "loc" ? d.locationId : d.deviceTypeId;
    const name = (id && catName(key, id)) || noneLabel;
    (groups.get(name) || groups.set(name, []).get(name)).push(d);
  }
  const names = [...groups.keys()].sort((a, b) => a.localeCompare(b) * mul);
  const nodes = [];
  for (const name of names) {
    const items = groups.get(name).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    nodes.push(sectionHeader(name, items.length), ...items.map(card));
  }
  return nodes;
}

export function renderList() {
  const list = qs("#device-list");
  const empty = qs("#empty");
  const meta = qs("#list-meta");
  const { devices } = getState();
  const shown = filteredDevices();
  const { key, dir } = getSort();

  const nodes = GROUPED[key] ? groupedNodes(shown, key, dir) : flatSorted(shown, key, dir).map(card);
  list.replaceChildren(...nodes);
  meta.textContent = t("list.count", { n: shown.length }) + (shown.length !== devices.length ? ` / ${devices.length}` : "");

  if (!shown.length) {
    empty.hidden = false;
    empty.textContent = devices.length ? t("list.empty.filtered") : t("list.empty");
  } else {
    empty.hidden = true;
  }
}
