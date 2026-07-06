// Backup / restore. JSON is the full-fidelity format (devices + categories +
// photo attachments as base64); CSV is export-only for spreadsheets.
//
// Import offers two modes:
//   replace — wipe local data, then restore the file verbatim
//   merge   — keep local data; per-device conflicts resolved by a policy
//             (newest-wins | keep-existing | prefer-imported)
//
// The pure functions (toCSV / summarizeImport / applyImport) take the db
// wrapper and touch no DOM, so `node --test` exercises them directly.

import { h, qs, toast, saveFile, formatDate } from "./dom.js";
import { t } from "./i18n.js";
import { openModal, confirm, field } from "./modal.js";
import { getState, reload, catName } from "./store.js";

const CSV_COLS = [
  "identity", "codeKind", "codeRaw", "type", "model", "url",
  "location", "status", "notes", "vendorId", "productId", "passcode",
  "createdAt", "updatedAt",
];

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Devices → CSV string. `lookup(kind,id)` resolves category names. */
export function toCSV(devices, lookup) {
  const rows = [CSV_COLS.join(",")];
  for (const d of devices) {
    rows.push(
      [
        d.identity, d.codeKind, d.codeRaw,
        lookup("type", d.deviceTypeId) || "",
        d.model || "",
        d.url || "",
        d.locationId ? lookup("loc", d.locationId) || "" : "",
        lookup("status", d.statusId) || "",
        d.notes || "",
        d.matter?.vendorId ?? "",
        d.matter?.productId ?? "",
        d.matter?.passcode ?? "",
        d.createdAt || "", d.updatedAt || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

function isBackup(obj) {
  return obj && obj.format === "matterqr-backup" && Array.isArray(obj.docs);
}

/** Triage an import against local state: new / update(newer) / conflict(stale). */
export async function summarizeImport(db, backup) {
  if (!isBackup(backup)) throw new Error("bad backup");
  const local = new Map((await db.listDevices()).map((d) => [d._id, d]));
  let neu = 0, update = 0, conflict = 0;
  for (const doc of backup.docs) {
    if (doc.type !== "device") continue;
    const cur = local.get(doc._id);
    if (!cur) neu++;
    else if ((doc.updatedAt || "") > (cur.updatedAt || "")) update++;
    else conflict++;
  }
  return { new: neu, update, conflict, total: backup.docs.filter((d) => d.type === "device").length };
}

/**
 * Apply an import.
 * @param opts.mode "replace" | "merge"
 * @param opts.conflict "newer" | "keepLocal" | "keepImport"  (merge only)
 */
export async function applyImport(db, backup, { mode = "merge", conflict = "newer" } = {}) {
  if (!isBackup(backup)) throw new Error("bad backup");

  if (mode === "replace") await db.clearData();

  const local = mode === "replace" ? new Map() : new Map((await db.listDevices()).map((d) => [d._id, d]));
  let applied = 0;

  for (const doc of backup.docs) {
    if (doc.type === "category") {
      // Categories always upsert by id so device references stay valid.
      await db.upsertRaw(doc);
      continue;
    }
    if (doc.type !== "device") continue;

    if (mode === "replace") {
      await db.upsertRaw(doc);
      applied++;
      continue;
    }
    const cur = local.get(doc._id);
    if (!cur) {
      await db.upsertRaw(doc);
      applied++;
    } else if (conflict === "keepImport") {
      await db.upsertRaw(doc);
      applied++;
    } else if (conflict === "newer" && (doc.updatedAt || "") > (cur.updatedAt || "")) {
      await db.upsertRaw(doc);
      applied++;
    } // keepLocal, or stale under newer → skip
  }
  return { applied };
}

// --- UI --------------------------------------------------------------------

export function openBackupModal() {
  const db = getState().db;

  async function exportJSON() {
    const backup = await db.exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    await saveFile(blob, `matterqr-${todayStamp()}.json`, "application/json");
    await db.saveSettings({ lastBackupAt: new Date().toISOString() });
  }

  async function exportCSV() {
    const csv = toCSV(getState().devices, catName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel
    await saveFile(blob, `matterqr-${todayStamp()}.csv`, "text/csv");
  }

  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "hidden" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    let backup;
    try {
      backup = JSON.parse(await f.text());
      if (!isBackup(backup)) throw new Error("bad");
    } catch {
      toast(t("backup.bad"), "error");
      return;
    }
    m.close();
    openImportPreview(db, backup);
  });

  const row = (label, onClick, cls = "") =>
    h("button", { class: `w-full rounded-lg border border-slate-300 px-4 py-3 text-left text-sm dark:border-slate-700 ${cls}`, onClick }, label);

  const body = h("div", { class: "space-y-2" }, [
    row(t("backup.export.json"), exportJSON, "bg-emerald-50 dark:bg-emerald-950/40"),
    row(t("backup.export.csv"), exportCSV),
    row(t("backup.import"), () => fileInput.click()),
    fileInput,
  ]);

  const m = openModal({ title: t("backup.title"), body });
}

function openImportPreview(db, backup) {
  let summary = { new: 0, update: 0, conflict: 0, total: 0 };
  const summaryEl = h("div", { class: "text-sm font-medium" }, "…");
  summarizeImport(db, backup).then((s) => {
    summary = s;
    summaryEl.textContent = t("backup.summary", { new: s.new, update: s.update, conflict: s.conflict });
  });

  const mode = h("select", { class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" }, [
    h("option", { value: "merge" }, t("backup.mode.merge")),
    h("option", { value: "replace" }, t("backup.mode.replace")),
  ]);
  const conflict = h("select", { class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" }, [
    h("option", { value: "newer" }, t("backup.conflict.newer")),
    h("option", { value: "keepLocal" }, t("backup.conflict.keepLocal")),
    h("option", { value: "keepImport" }, t("backup.conflict.keepImport")),
  ]);
  const conflictField = field(t("backup.conflict"), conflict);
  mode.addEventListener("change", () => {
    conflictField.hidden = mode.value === "replace";
  });

  const cancel = h("button", { class: "rounded-lg px-4 py-2 text-sm", onClick: () => m.close() }, t("action.cancel"));
  const apply = h("button", { class: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" }, t("backup.apply"));
  apply.addEventListener("click", async () => {
    if (mode.value === "replace" && !(await confirm(t("backup.replace.warn"), { danger: true }))) return;
    apply.disabled = true;
    try {
      const { applied } = await applyImport(db, backup, { mode: mode.value, conflict: conflict.value });
      await reload();
      m.close();
      toast(t("backup.done", { n: applied }), "success");
    } catch (e) {
      console.error(e);
      toast(t("err.generic"), "error");
      apply.disabled = false;
    }
  });

  const body = h("div", { class: "space-y-3" }, [
    summaryEl,
    field(t("backup.mode"), mode),
    conflictField,
  ]);
  const m = openModal({ title: t("backup.import.title"), body, actions: [cancel, apply] });
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** Header hint text: last backup age (or a nudge if never). */
export function lastBackupLabel(settings) {
  if (settings?.lastBackupAt) return t("backup.last", { when: formatDate(settings.lastBackupAt) });
  return t("backup.never");
}
