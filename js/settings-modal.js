// Settings: language + optional CouchDB sync. Saving restarts replication.

import { h, toast } from "./dom.js";
import { t, getLang, setLang } from "./i18n.js";
import { getTheme, setTheme } from "./theme.js";
import { openModal, field } from "./modal.js";
import { getState, reload } from "./store.js";
import { startSync, testConnection } from "./sync.js";
import { lastBackupLabel } from "./backup.js";
import { APP_VERSION } from "./version.js";

export async function openSettingsModal() {
  const db = getState().db;
  const s = await db.getSettings();
  openWith(db, s);
}

// Built as a function so a language change can re-render the whole modal in the
// new language — reopening with the current (possibly unsaved) field values so
// nothing the user typed is lost.
function openWith(db, s) {
  // --- language ---
  const lang = h("select", { class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" }, [
    h("option", { value: "ko", selected: getLang() === "ko" }, "한국어"),
    h("option", { value: "en", selected: getLang() === "en" }, "English"),
  ]);
  lang.addEventListener("change", async () => {
    await setLang(lang.value);
    m.close();
    // Reopen in the new language, carrying over whatever is in the fields now.
    openWith(db, { ...s, syncEnabled: enable.checked, syncUrl: url.value, syncUser: user.value, syncPass: pass.value });
  });

  // --- theme --- (applies immediately for a live preview)
  const theme = h("select", { class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900" }, [
    h("option", { value: "system", selected: getTheme() === "system" }, t("theme.system")),
    h("option", { value: "light", selected: getTheme() === "light" }, t("theme.light")),
    h("option", { value: "dark", selected: getTheme() === "dark" }, t("theme.dark")),
  ]);
  theme.addEventListener("change", () => setTheme(theme.value));

  // --- sync ---
  const enable = h("input", { type: "checkbox", class: "h-4 w-4", checked: !!s.syncEnabled });
  const url = h("input", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    value: s.syncUrl || "",
    placeholder: t("settings.url.ph"),
    inputmode: "url",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
  });
  const user = h("input", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    value: s.syncUser || "",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
  });
  const pass = h("input", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    type: "password",
    value: s.syncPass || "",
  });

  const testBtn = h("button", { class: "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" }, t("settings.test"));
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    const ok = await testConnection({ syncUrl: url.value.trim(), syncUser: user.value.trim(), syncPass: pass.value });
    toast(t(ok ? "settings.test.ok" : "settings.test.fail"), ok ? "success" : "error");
    testBtn.disabled = false;
  });

  const body = h("div", { class: "space-y-4" }, [
    field(t("settings.lang"), lang),
    field(t("settings.theme"), theme),
    h("div", { class: "space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800" }, [
      h("div", { class: "flex items-center gap-2 text-sm font-medium" }, [enable, h("span", {}, t("settings.sync.enable"))]),
      field(t("settings.url"), url),
      h("div", { class: "grid grid-cols-2 gap-2" }, [field(t("settings.user"), user), field(t("settings.pass"), pass)]),
      testBtn,
    ]),
    h("div", { class: "text-xs text-slate-500" }, lastBackupLabel(s)),
    h("div", { class: "border-t border-slate-200 pt-2 text-center text-[11px] text-slate-400 dark:border-slate-800" }, `MatterQR v${APP_VERSION}`),
  ]);

  const cancel = h("button", { class: "rounded-lg px-4 py-2 text-sm", onClick: () => m.close() }, t("action.cancel"));
  const save = h("button", { class: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" }, t("action.save"));
  save.addEventListener("click", async () => {
    const next = await db.saveSettings({
      syncEnabled: enable.checked,
      syncUrl: url.value.trim(),
      syncUser: user.value.trim(),
      syncPass: pass.value,
    });
    startSync(db, next, reload);
    m.close();
    toast(t("settings.saved"), "success");
  });

  const m = openModal({ title: t("settings.title"), body, actions: [cancel, save] });
}
