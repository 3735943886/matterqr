// Service worker: precache the app shell for offline + installable PWA.
// Data lives in IndexedDB (PouchDB), so it is never touched here. Bump CACHE
// on each deploy to roll users onto the new shell.

const CACHE = "matterqr-v2";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/db.js",
  "./js/matter.js",
  "./js/qr.js",
  "./js/dom.js",
  "./js/i18n.js",
  "./js/modal.js",
  "./js/store.js",
  "./js/render.js",
  "./js/filters.js",
  "./js/device-modal.js",
  "./js/scan.js",
  "./js/backup.js",
  "./js/sync.js",
  "./js/settings-modal.js",
  "./vendor/tailwind.js",
  "./vendor/pouchdb.js",
  "./vendor/jsQR.js",
  "./vendor/qrcode.js",
  "./locales/ko.json",
  "./locales/en.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Only handle our own origin+scope; let CouchDB replication go to the network.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => (request.mode === "navigate" ? caches.match("./index.html") : undefined));
    }),
  );
});
