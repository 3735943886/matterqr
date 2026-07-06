// Scan flow: live camera (jsQR) + manual code entry, with the dedup branch.
//
// Default mode: one scan → open register/edit modal.
// Continuous mode: rapid capture of many devices into an "unclassified" queue
// (minimal record saved immediately, metadata filled in later from the list).

import { h, qs, toast } from "./dom.js";
import { t } from "./i18n.js";
import { openModal } from "./modal.js";
import { getState, reload } from "./store.js";
import { decode, identity as identityOf, matterFields } from "./matter.js";
import { openDeviceModal } from "./device-modal.js";

export function openScanModal() {
  const db = getState().db;
  let stream = null;
  let raf = 0;
  let continuous = false;
  let queued = 0;
  const recent = new Map(); // code → last-handled ms, to ignore repeat frames

  const video = h("video", { class: "h-full w-full object-cover", playsinline: true, autoplay: true, muted: true });
  const canvas = document.createElement("canvas");
  const viewport = h(
    "div",
    { class: "relative aspect-square w-full overflow-hidden rounded-xl bg-black" },
    [
      video,
      h("div", { class: "pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" }),
      h("div", { class: "pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80" }, t("scan.hint")),
    ],
  );

  const camError = h("div", { class: "rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100", hidden: true }, t("scan.nocam"));

  const manual = h("input", {
    class: "flex-1 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900",
    placeholder: t("scan.manual.ph"),
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: false,
  });
  const manualBtn = h("button", { class: "rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white" }, t("scan.lookup"));

  const contToggle = h("input", { type: "checkbox", class: "h-4 w-4" });
  const queueLabel = h("span", { class: "text-xs text-slate-500" }, "");
  function updateQueue() {
    queueLabel.textContent = queued ? t("scan.queue", { n: queued }) : "";
  }

  const body = h("div", { class: "space-y-3" }, [
    viewport,
    camError,
    h("div", { class: "flex gap-2" }, [manual, manualBtn]),
    h("label", { class: "flex items-center gap-2 text-sm" }, [contToggle, h("span", {}, t("scan.continuous")), queueLabel]),
  ]);

  contToggle.addEventListener("change", () => {
    continuous = contToggle.checked;
  });

  async function handleCode(text) {
    const raw = (text || "").trim();
    if (!raw) return;
    const now = Date.now();
    if (recent.get(raw) && now - recent.get(raw) < 2500) return; // same frame/code
    recent.set(raw, now);

    const decoded = decode(raw);
    const id = identityOf(decoded);
    const existing = await db.getDevice(id);

    if (existing) {
      if (continuous) {
        toast(t("device.duplicate"), "warn");
        return;
      }
      stop();
      m.close();
      toast(t("device.duplicate"), "warn");
      openDeviceModal({ device: existing });
      return;
    }

    if (continuous) {
      // Minimal record → fill metadata later from the dashboard.
      await db.putDevice({ identity: id, codeRaw: decoded.raw, codeKind: decoded.kind, matter: matterFields(decoded) });
      await reload();
      queued++;
      updateQueue();
      toast(t("device.added"), "success");
    } else {
      stop();
      m.close();
      openDeviceModal({ decoded });
    }
  }

  manualBtn.addEventListener("click", () => {
    handleCode(manual.value);
    manual.value = "";
  });
  manual.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleCode(manual.value);
      manual.value = "";
    }
  });

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      if (code?.data) handleCode(code.data);
    }
    raf = requestAnimationFrame(tick);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      camError.hidden = false;
      viewport.hidden = true;
      manual.focus();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stream;
      await video.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    } catch {
      camError.hidden = false;
      viewport.hidden = true;
      manual.focus();
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
  }

  const m = openModal({ title: t("scan.title"), body, onClose: stop });
  start();
  return m;
}
