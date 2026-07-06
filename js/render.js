// Dashboard device list. Renders filtered devices as tappable cards.

import { h, qs, escapeHtml, formatAgo, photoURL } from "./dom.js";
import { t } from "./i18n.js";
import { getState, filteredDevices, catName } from "./store.js";
import { openDeviceModal } from "./device-modal.js";

const KIND_BADGE = {
  matter_qr: { label: "QR", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  manual: { label: "PIN", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200" },
  other: { label: "•", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

async function loadThumb(imgEl, identity) {
  const db = getState().db;
  const blob = await db.getPhoto(identity).catch(() => null);
  if (blob) imgEl.src = photoURL(blob);
  else imgEl.replaceWith(h("div", { class: "grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl dark:bg-slate-800" }, "🔲"));
}

function statusChip(name, tone = "slate") {
  const map = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return h("span", { class: `rounded-full px-2 py-0.5 text-[11px] ${map[tone]}` }, name);
}

function card(d) {
  const badge = KIND_BADGE[d.codeKind] || KIND_BADGE.other;
  const title = d.model || catName("type", d.deviceTypeId) || d.codeRaw || d.identity;
  const typeName = catName("type", d.deviceTypeId);
  const locName = d.locationId ? catName("loc", d.locationId) : t("filter.unassigned");
  const statusName = catName("status", d.statusId);

  const img = h("img", { class: "h-14 w-14 shrink-0 rounded-lg object-cover", alt: "" });
  loadThumb(img, d.identity);

  const sub = [typeName, d.matter ? `V:${d.matter.vendorId ?? "-"} P:${d.matter.productId ?? "-"}` : null]
    .filter(Boolean)
    .join(" · ");

  return h(
    "button",
    {
      class:
        "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-slate-300 active:scale-[.99] dark:border-slate-800 dark:bg-slate-900",
      onClick: () => openDeviceModal({ device: d }),
    },
    [
      img,
      h("div", { class: "min-w-0 flex-1" }, [
        h("div", { class: "flex items-center gap-2" }, [
          h("span", { class: `rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}` }, badge.label),
          h("span", { class: "truncate font-medium" }, title),
        ]),
        sub && h("div", { class: "truncate text-xs text-slate-500" }, sub),
        h("div", { class: "mt-1 flex flex-wrap items-center gap-1" }, [
          statusChip("📍 " + locName),
          statusName && statusChip(statusName),
        ]),
      ]),
      h("div", { class: "shrink-0 self-start text-[11px] text-slate-400" }, formatAgo(d.updatedAt, t)),
    ],
  );
}

export function renderList() {
  const list = qs("#device-list");
  const empty = qs("#empty");
  const meta = qs("#list-meta");
  const { devices } = getState();
  const shown = filteredDevices();

  list.replaceChildren(...shown.map(card));
  meta.textContent = t("list.count", { n: shown.length }) + (shown.length !== devices.length ? ` / ${devices.length}` : "");

  if (!shown.length) {
    empty.hidden = false;
    empty.textContent = devices.length ? t("list.empty.filtered") : t("list.empty");
  } else {
    empty.hidden = true;
  }
}
