// PouchDB data layer for MatterQR.
//
// Local IndexedDB is the offline source of truth; an optional CouchDB peer
// (see sync.js) replicates it. This module is storage-agnostic: it takes a
// PouchDB constructor so the browser passes the IndexedDB build (window.PouchDB)
// and `node --test` passes the in-memory adapter.
//
// Document id scheme (all range-queryable by prefix):
//   dev:<identity>          one inventory device (identity from matter.js)
//   cat:type:<uuid>         device-type category
//   cat:loc:<uuid>          install location
//   cat:status:<uuid>       lifecycle status
//   _local/settings         device-local config (never replicated)
//
// Keying a device on "dev:"+identity makes duplicate registration structurally
// impossible: a re-scan resolves to the same _id and becomes an edit.

const CAT_KINDS = ["type", "loc", "status"];

// Seed categories so the dropdowns are never empty on first run.
const SEED = {
  type: ["Light", "Plug", "Sensor", "Door lock", "Thermostat"],
  status: ["In stock", "Installed", "Faulty", "Retired"],
  loc: [], // locations are user-specific; "unassigned" is locationId=null
};

function uuid() {
  return globalThis.crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

// Range bounds for an allDocs prefix query.
function prefixRange(prefix) {
  return { startkey: prefix, endkey: prefix + "￰" };
}

export function createDb(PouchDB, name = "matterqr") {
  const db = new PouchDB(name);

  // --- categories (type / location / status) ------------------------------
  async function listCategory(kind) {
    const res = await db.allDocs({ include_docs: true, ...prefixRange(`cat:${kind}:`) });
    return res.rows.map((r) => ({ id: r.doc._id, name: r.doc.name, kind }));
  }

  async function addCategory(kind, name) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new Error("category name required");
    // Reject case-insensitive duplicates so "+add" can't fork a category.
    const existing = await listCategory(kind);
    const hit = existing.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (hit) return hit;
    const doc = { _id: `cat:${kind}:${uuid()}`, type: "category", kind, name: trimmed };
    await db.put(doc);
    return { id: doc._id, name: trimmed, kind };
  }

  async function renameCategory(id, name) {
    const doc = await db.get(id);
    doc.name = (name ?? "").trim();
    await db.put(doc);
  }

  // Only removes the label; devices referencing it keep the id until re-edited.
  async function deleteCategory(id) {
    const doc = await db.get(id);
    await db.remove(doc);
  }

  async function ensureSeed() {
    for (const kind of CAT_KINDS) {
      const existing = await listCategory(kind);
      if (existing.length) continue;
      for (const name of SEED[kind]) await addCategory(kind, name);
    }
  }

  // --- devices ------------------------------------------------------------
  function devId(identity) {
    return `dev:${identity}`;
  }

  async function getDevice(identity) {
    try {
      return await db.get(devId(identity), { attachments: false });
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function listDevices() {
    const res = await db.allDocs({ include_docs: true, ...prefixRange("dev:") });
    return res.rows.map((r) => r.doc);
  }

  /**
   * Upsert a device. `fields` carries identity + code + metadata.
   * `photo` semantics: undefined = keep existing, null = remove, {content_type,data} = replace.
   */
  async function putDevice(fields, photo = undefined) {
    if (!fields.identity) throw new Error("device.identity required");
    const _id = devId(fields.identity);
    let existing = null;
    try {
      existing = await db.get(_id);
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    const doc = {
      _id,
      type: "device",
      identity: fields.identity,
      codeRaw: fields.codeRaw ?? existing?.codeRaw ?? "",
      codeKind: fields.codeKind ?? existing?.codeKind ?? "other",
      matter: fields.matter ?? existing?.matter ?? null,
      deviceTypeId: fields.deviceTypeId ?? null,
      locationId: fields.locationId ?? null,
      statusId: fields.statusId ?? null,
      model: fields.model ?? "",
      url: fields.url ?? "",
      notes: fields.notes ?? "",
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    if (existing?._rev) doc._rev = existing._rev;

    if (photo === undefined) {
      // Preserve existing attachment stubs across the put.
      if (existing?._attachments) doc._attachments = existing._attachments;
    } else if (photo === null) {
      // omit _attachments → drops the photo
    } else {
      doc._attachments = {
        photo: { content_type: photo.content_type || "image/jpeg", data: photo.data },
      };
    }

    const res = await db.put(doc);
    return { ...doc, _rev: res.rev };
  }

  async function deleteDevice(identity) {
    const doc = await db.get(devId(identity));
    await db.remove(doc);
  }

  // Returns the raw photo attachment (Blob in browser, Buffer in node) or null.
  async function getPhoto(identity) {
    try {
      return await db.getAttachment(devId(identity), "photo");
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // --- settings (device-local, not replicated) ----------------------------
  async function getSettings() {
    try {
      return await db.get("_local/settings");
    } catch (e) {
      if (e.status === 404) return { _id: "_local/settings" };
      throw e;
    }
  }

  async function saveSettings(patch) {
    const cur = await getSettings();
    const next = { ...cur, ...patch, _id: "_local/settings" };
    const res = await db.put(next);
    return { ...next, _rev: res.rev };
  }

  // --- backup helpers -----------------------------------------------------
  // Full dump: devices + categories with attachments as base64, no _rev.
  async function exportAll() {
    const res = await db.allDocs({ include_docs: true, attachments: true, binary: false });
    const docs = res.rows
      .map((r) => r.doc)
      .filter((d) => d && (d.type === "device" || d.type === "category"))
      .map(({ _rev, ...rest }) => rest);
    return { format: "matterqr-backup", version: 1, exportedAt: nowISO(), docs };
  }

  // Insert/overwrite one doc, resolving _rev against the local copy so we never
  // author a sync conflict (see plan: import _rev handling).
  async function upsertRaw(doc) {
    const clean = { ...doc };
    delete clean._rev;
    try {
      const existing = await db.get(clean._id);
      clean._rev = existing._rev;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    return db.put(clean);
  }

  // Remove every device + category doc (used by import "replace" mode).
  async function clearData() {
    const res = await db.allDocs({ include_docs: true });
    const dead = res.rows
      .map((r) => r.doc)
      .filter((d) => d && (d.type === "device" || d.type === "category"))
      .map((d) => ({ _id: d._id, _rev: d._rev, _deleted: true }));
    if (dead.length) await db.bulkDocs(dead);
  }

  return {
    raw: db,
    // categories
    listCategory,
    addCategory,
    renameCategory,
    deleteCategory,
    ensureSeed,
    // devices
    getDevice,
    listDevices,
    putDevice,
    deleteDevice,
    getPhoto,
    // settings
    getSettings,
    saveSettings,
    // backup
    exportAll,
    upsertRaw,
    clearData,
    // change stream (browser sync/live UI)
    changes: (opts) => db.changes(opts),
    destroy: () => db.destroy(),
  };
}
