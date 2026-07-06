# MatterQR

**An offline-first web app for cataloguing Matter smart-home devices by their QR / pairing codes.**

### ▶︎ Live app: **https://3735943886.github.io/matterqr/**

Open that URL on your iPhone in Safari and **Share → Add to Home Screen** to install it.

Every Matter device ships with an onboarding QR code (and a printed numeric
pairing code beneath it). MatterQR lets you scan or type that code to build a
searchable inventory of your devices — what they are, where they're installed,
and their status — without any server, account, or install step. It runs
entirely in the browser and is meant to be added to your phone's home screen as
a PWA.

> Scope: this is an **inventory / registry** tool. It records and organises
> device codes and metadata; it does **not** commission devices onto a Matter
> fabric.

## What it does

- **Scan or type a code** — use the phone camera (QR decoding runs locally) or
  enter the numeric pairing code by hand.
- **Automatic duplicate detection** — a Matter QR code and the printed manual
  pairing code both encode the same *passcode*, so scanning either form of the
  same device resolves to **one** record. Re-scanning a known device opens it
  for editing instead of creating a duplicate.
- **Rich metadata** — attach a device type, model, URL, photo, install
  location, and lifecycle status. Type / location / status are dropdowns you can
  extend on the fly with **＋ Add new**.
- **Dashboard with filters** — browse devices and filter by location, type, or
  status (each chip shows a live count), plus free-text search.
- **Backup & restore** — export a full JSON backup (photos included) or a CSV
  for spreadsheets. Import supports **Replace** (wipe and restore) or **Merge**
  with conflict handling (newest-wins / keep-existing / prefer-imported).
- **Optional multi-device sync** — point it at a self-hosted CouchDB and your
  phone and desktop stay in sync. Off by default; the app is fully functional
  offline and local-only.

## How it works

- **No backend.** Pure static HTML + JavaScript (ES modules), no build step.
- **Storage is local IndexedDB via [PouchDB](https://pouchdb.com/).** Your data
  lives in the browser on your device.
- **Installable PWA** with a service worker for offline use.
- **Durable by design.** Because browser storage can be evicted (especially on
  iOS), the app leans on three safeguards: installing to the home screen,
  optional CouchDB sync, and regular JSON backups. The settings panel shows when
  you last backed up.

Matter code decoding (Base-38 QR payloads and Verhoeff-checked manual codes) is
implemented from the Matter specification in [`js/matter.js`](js/matter.js).

## Install on iOS (primary use)

1. Open **https://3735943886.github.io/matterqr/** in **Safari** on your iPhone/iPad.
2. Tap **Share → Add to Home Screen**.
3. Launch it from the home screen — it runs full-screen with camera access.

The camera requires a secure context (HTTPS or `localhost`); a manual-entry
fallback is always available.

## Deploy (GitHub Pages)

The app is static, so GitHub Pages is the simplest host and gives you HTTPS
automatically (needed for install + camera):

1. Push this repository to GitHub (public repo → free Pages).
2. **Settings → Pages** → deploy from branch `main`, folder `/` (root).
3. Visit `https://<user>.github.io/<repo>/` and install it on your phone.

All asset paths are **relative**, so it works from the `/<repo>/` subpath as-is.
When you redeploy, bump `CACHE` in [`sw.js`](sw.js) (e.g. `matterqr-v2`) so
clients pick up the new shell. Your data is local to each device, so a public
repo only exposes the app code, never your inventory.

## Optional: CouchDB sync

In **Settings → CouchDB sync**, enter a URL and credentials and enable sync to
replicate two-way via `PouchDB.sync`. The browser needs the CouchDB server to
have **CORS enabled**, and iOS PWAs require a **valid TLS certificate**
(self-signed is rejected).

```bash
# CouchDB in Docker
docker run -d --name couch -p 5984:5984 \
  -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=secret couchdb:3

# Enable CORS for the browser origin
HOST=http://admin:secret@localhost:5984
curl -X PUT $HOST/_node/_local/_config/httpd/enable_cors -d '"true"'
curl -X PUT $HOST/_node/_local/_config/cors/origins      -d '"https://<user>.github.io"'
curl -X PUT $HOST/_node/_local/_config/cors/credentials  -d '"true"'
curl -X PUT $HOST/_node/_local/_config/cors/methods      -d '"GET, PUT, POST, HEAD, DELETE"'
curl -X PUT $HOST/_node/_local/_config/cors/headers \
  -d '"accept, authorization, content-type, origin, referer"'
curl -X PUT $HOST/matterqr        # create the target database
```

In production, put CouchDB behind a reverse proxy with valid TLS and use that
HTTPS URL.

## Development

```bash
python3 -m http.server 8000       # run locally → http://localhost:8000

npm install                       # test deps: pouchdb (memory), @playwright/test
npx playwright install chromium
npm test                          # unit: matter decode / db / backup  (node --test)
npm run e2e                       # browser smoke: register, dedup, sync-form, persistence
```

`js/matter.js` is pure functions imported directly by the Node test runner;
`js/db.js` and `js/backup.js` are tested against PouchDB's in-memory adapter.

## Project structure

```
index.html            App shell (Tailwind, Apple meta, safe-area, 16px input fix)
manifest.webmanifest  PWA manifest        sw.js   Service worker (offline shell cache)
js/
  app.js       entry / wiring          db.js       PouchDB data layer
  matter.js    QR + manual decode, identity/dedup key
  scan.js      camera + jsQR + manual + continuous scan
  device-modal.js  register / edit    render.js filters.js store.js  dashboard
  backup.js    export / import        sync.js  settings-modal.js     CouchDB
  dom.js  i18n.js  modal.js
locales/  en.json ko.json             vendor/  pouchdb.js jsQR.js tailwind.js
assets/   PWA icons                    tests/   *.test.mjs (node) + e2e/ (Playwright)
```

## License

MIT
