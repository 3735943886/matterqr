// Register / edit a device. Handles the dedup branch (existing → edit),
// category dropdowns with inline "+add", and photo capture with downscaling.

import { h, toast, photoURL, resizeImage } from "./dom.js";
import { t } from "./i18n.js";
import { openModal, confirm, field } from "./modal.js";
import { getState, reload } from "./store.js";
import { identity as identityOf, matterFields } from "./matter.js";
import { qrImage } from "./qr.js";

const ADD = "__add__";

// Fullscreen-ish QR for scanning from another device's camera.
function enlargeQR(text) {
  const big = qrImage(text, { size: Math.min(320, Math.floor(window.innerWidth * 0.8)) });
  if (!big) return;
  openModal({
    title: t("device.qr"),
    body: h("div", { class: "space-y-3 text-center" }, [
      h("div", { class: "mx-auto inline-block rounded-xl bg-white p-4" }, big),
      h("div", { class: "break-all px-2 font-mono text-xs text-slate-500" }, text),
    ]),
  });
}

// Small text-input modal used by the "+add category" flow.
function promptText(title, placeholder = "") {
  return new Promise((resolve) => {
    const input = h("input", {
      class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-800",
      placeholder,
      autocapitalize: "off",
    });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      m.close();
      resolve(v);
    };
    const cancel = h("button", { class: "rounded-lg px-4 py-2 text-sm", onClick: () => finish(null) }, t("action.cancel"));
    const ok = h(
      "button",
      { class: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white", onClick: () => finish(input.value.trim() || null) },
      t("action.add"),
    );
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value.trim() || null);
    });
    const m = openModal({ title, body: input, actions: [cancel, ok], onClose: () => finish(null) });
    setTimeout(() => input.focus(), 50);
  });
}

// A <select> over a category kind, plus a synthetic "+add" option.
function buildSelect(kind, currentId, noneLabel) {
  const sel = h("select", {
    class: "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
  });

  function fill(selectedId) {
    const cats = getState().cats[kind];
    sel.replaceChildren(
      h("option", { value: "" }, noneLabel),
      ...cats.map((c) => h("option", { value: c.id, selected: c.id === selectedId }, c.name)),
      h("option", { value: ADD }, t("cat.add")),
    );
    sel.value = selectedId || "";
  }
  fill(currentId);

  sel.addEventListener("change", async () => {
    if (sel.value !== ADD) return;
    sel.value = currentId || "";
    const name = await promptText(t("cat.add"), t("cat.add.prompt"));
    if (!name) return;
    const cat = await getState().db.addCategory(kind, name);
    await reload(); // refresh global cats (filters etc.)
    currentId = cat.id;
    fill(cat.id);
  });

  return {
    el: sel,
    value: () => (sel.value && sel.value !== ADD ? sel.value : null),
  };
}

/**
 * openDeviceModal({ device })                       → edit existing
 * openDeviceModal({ decoded })                      → register new (from scan)
 * `decoded` is a matter.js decode result.
 */
export async function openDeviceModal({ device = null, decoded = null } = {}) {
  const db = getState().db;
  const isEdit = !!device;

  const identity = isEdit ? device.identity : identityOf(decoded);
  const codeRaw = isEdit ? device.codeRaw : decoded.raw;
  const codeKind = isEdit ? device.codeKind : decoded.kind;
  const matter = isEdit ? device.matter : matterFields(decoded);

  // photoState: "keep" | File-like {content_type,data,blob} | "remove"
  let photoState = "keep";

  const typeSel = buildSelect("type", device?.deviceTypeId, t("filter.none"));
  const locSel = buildSelect("loc", device?.locationId, t("filter.unassigned"));
  const statusSel = buildSelect("status", device?.statusId, t("filter.none"));

  const model = h("input", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    value: device?.model || "",
    placeholder: t("device.model.ph"),
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
  });
  const url = h("input", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    value: device?.url || "",
    placeholder: t("device.url.ph"),
    inputmode: "url",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
  });
  const notes = h("textarea", {
    class: "w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    rows: 2,
    placeholder: t("device.notes.ph"),
  });
  notes.value = device?.notes || "";

  // --- photo ---
  const preview = h("img", { class: "h-24 w-24 rounded-lg object-cover", hidden: true, alt: "" });
  const fileInput = h("input", { type: "file", accept: "image/*", capture: "environment", class: "hidden" });
  const removeBtn = h(
    "button",
    { class: "rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700", hidden: true },
    t("device.photo.remove"),
  );
  const addBtn = h(
    "button",
    { class: "rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" },
    "📷 " + t("device.photo.add"),
  );
  function showPreview(url2) {
    preview.src = url2;
    preview.hidden = false;
    removeBtn.hidden = false;
    addBtn.hidden = true;
  }
  function clearPreview() {
    preview.hidden = true;
    removeBtn.hidden = true;
    addBtn.hidden = false;
  }
  if (isEdit) {
    db.getPhoto(identity).then((b) => b && photoState === "keep" && showPreview(photoURL(b)));
  }
  addBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const resized = await resizeImage(f);
    photoState = resized;
    showPreview(photoURL(resized.blob));
  });
  removeBtn.addEventListener("click", () => {
    photoState = "remove";
    clearPreview();
  });

  // --- code / matter hint (read-only) + rendered QR ---
  const hintParts = [];
  if (matter?.vendorId != null) hintParts.push(`${t("device.hint.vendor")}: 0x${matter.vendorId.toString(16).toUpperCase()}`);
  if (matter?.productId != null) hintParts.push(`${t("device.hint.product")}: 0x${matter.productId.toString(16).toUpperCase()}`);

  // Regenerate a scannable QR from the stored code so it can be shown/re-scanned.
  // Skip it for manual pairing codes: we'd only have the numeric code, so the QR
  // would encode those digits — a code that looks scannable but isn't the
  // device's real Matter QR (the manual code can't be rebuilt into one, as it
  // drops most of the discriminator). Showing it would mislead.
  const qrImg = codeKind === "manual" ? null : qrImage(codeRaw || identity, { size: 148 });
  const qrPanel =
    qrImg &&
    h(
      "button",
      {
        type: "button",
        class: "mx-auto block rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200",
        title: t("device.qr.enlarge"),
        onClick: () => enlargeQR(codeRaw || identity),
      },
      qrImg,
    );

  const codeBox = h("div", { class: "rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-800" }, [
    h("div", { class: "break-all font-mono" }, codeRaw || identity),
    hintParts.length && h("div", { class: "mt-1 text-slate-500" }, hintParts.join("  ·  ")),
  ]);

  const body = h("div", { class: "space-y-3" }, [
    qrPanel,
    field(t("device.code"), codeBox),
    field(t("device.type"), typeSel.el),
    field(t("device.model"), model),
    field(t("device.url"), url),
    field(t("device.photo"), h("div", { class: "flex items-center gap-3" }, [preview, addBtn, removeBtn, fileInput])),
    field(t("device.location"), locSel.el),
    field(t("device.status"), statusSel.el),
    field(t("device.notes"), notes),
  ]);

  const actions = [];
  if (isEdit) {
    actions.push(
      h(
        "button",
        {
          class: "mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
          onClick: async () => {
            if (!(await confirm(t("confirm.delete"), { danger: true }))) return;
            await db.deleteDevice(identity);
            await reload();
            m.close();
            toast(t("device.deleted"), "success");
          },
        },
        t("action.delete"),
      ),
    );
  }
  const cancel = h("button", { class: "rounded-lg px-4 py-2 text-sm", onClick: () => m.close() }, t("action.cancel"));
  const save = h(
    "button",
    { class: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500" },
    t("action.save"),
  );
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const photoArg = photoState === "keep" ? undefined : photoState === "remove" ? null : photoState;
      await db.putDevice(
        {
          identity,
          codeRaw,
          codeKind,
          matter,
          deviceTypeId: typeSel.value(),
          locationId: locSel.value(),
          statusId: statusSel.value(),
          model: model.value.trim(),
          url: url.value.trim(),
          notes: notes.value.trim(),
        },
        photoArg,
      );
      await reload();
      m.close();
      toast(isEdit ? t("device.updated") : t("device.added"), "success");
    } catch (e) {
      console.error(e);
      toast(t("err.generic"), "error");
      save.disabled = false;
    }
  });
  actions.push(cancel, save);

  const m = openModal({ title: isEdit ? t("device.edit") : t("device.new"), body, actions });
  return m;
}
