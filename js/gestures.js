// One home for suppressing the browser's built-in zoom gestures, which distort
// the fixed PWA layout. Two things to block:
//   • pinch-to-zoom — Safari's gesture* events (touch-action doesn't stop it).
//   • double-tap-to-zoom — a second tap within 300ms. touch-action:manipulation
//     (index.html) covers this on most elements, but Safari ignores it on the
//     sticky, backdrop-blurred header, so we also guard it here.
// Not touched: the photo viewer zooms via Pointer Events, and text fields keep
// double-tap-to-select (exempted below).
export function initGestureGuards() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }),
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      const doubleTap = now - lastTouchEnd <= 300;
      lastTouchEnd = now;
      if (doubleTap && !e.target.closest?.("input, textarea, [contenteditable]")) e.preventDefault();
    },
    { passive: false },
  );
}
