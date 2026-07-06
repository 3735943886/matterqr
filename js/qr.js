// QR rendering (generation, not decoding — jsQR only decodes).
// Wraps the vendored qrcode-generator global to turn a device's stored code
// back into a scannable QR image, so the device screen can display it.

import { h } from "./dom.js";

/**
 * Build a QR <img> for `text`. Returns null if generation fails (e.g. the
 * string is too long for the largest QR version) or the lib isn't loaded.
 * The base raster is small; `image-rendering: pixelated` keeps it crisp when
 * scaled to `size` px.
 */
export function qrImage(text, { size = 160, ec = "M" } = {}) {
  if (!text || !window.qrcode) return null;
  try {
    const qr = window.qrcode(0, ec); // 0 = auto-select the smallest fitting version
    qr.addData(text);
    qr.make();
    const img = h("img", {
      src: qr.createDataURL(8, 2),
      alt: "QR",
      width: size,
      height: size,
      class: "block",
      style: "image-rendering: pixelated; width: " + size + "px; height: " + size + "px;",
    });
    return img;
  } catch {
    return null;
  }
}
