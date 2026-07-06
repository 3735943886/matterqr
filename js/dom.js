// Tiny DOM + media helpers shared across the client. No framework.

/** Create an element: h("button", {class:"x", onClick:fn}, "label" | [nodes]) */
export function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k in node && k !== "list") {
      try {
        node[k] = v;
      } catch {
        node.setAttribute(k, v);
      }
    } else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

/** Ephemeral toast. kind: info | warn | error | success */
export function toast(msg, kind = "info", ms = 2600) {
  const root = qs("#toasts") || document.body.appendChild(h("div", { id: "toasts" }));
  const colors = {
    info: "bg-slate-800 text-white",
    warn: "bg-amber-500 text-black",
    error: "bg-red-600 text-white",
    success: "bg-emerald-600 text-white",
  };
  const t = h("div", {
    class: `pointer-events-auto rounded-lg px-4 py-2 text-sm shadow-lg ${colors[kind] || colors.info}`,
    role: "status",
  }, msg);
  root.append(t);
  setTimeout(() => {
    t.style.transition = "opacity .3s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 300);
  }, ms);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Human "N일 전" style age, falls back to date for old items. */
export function formatAgo(iso, t = (k) => k) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t("time.now");
  if (diff < 3600) return `${Math.floor(diff / 60)}${t("time.min")}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t("time.hour")}`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}${t("time.day")}`;
  return formatDate(iso).slice(0, 10);
}

const objectUrls = new WeakMap();
/** Object URL for a photo Blob (cached per-blob so we don't leak duplicates). */
export function photoURL(blob) {
  if (!blob) return null;
  if (objectUrls.has(blob)) return objectUrls.get(blob);
  const url = URL.createObjectURL(blob);
  objectUrls.set(blob, url);
  return url;
}

/**
 * Downscale a captured/selected image to keep IndexedDB (and iOS memory) small.
 * Respects EXIF orientation. Returns { content_type, data: Blob, blob }.
 */
export async function resizeImage(file, maxPx = 1024, quality = 0.7) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(
    () => createImageBitmap(file),
  );
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h2 = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h2;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h2);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  return { content_type: "image/jpeg", data: blob, blob };
}

/** Trigger a client-side file download from a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * iOS-friendly save: prefer the native share sheet (Files / AirDrop / mail),
 * fall back to a direct download when file sharing isn't available.
 */
export async function saveFile(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime || blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
