// Run: node --test tests/backup.test.mjs
// Exercises the pure backup functions against an in-memory PouchDB.
import { test } from "node:test";
import assert from "node:assert/strict";
import PouchDB from "pouchdb";
import memory from "pouchdb-adapter-memory";
import { createDb } from "../js/db.js";
import { toCSV, summarizeImport, applyImport } from "../js/backup.js";

PouchDB.plugin(memory);
const Mem = PouchDB.defaults({ adapter: "memory" });
let seq = 0;
const freshDb = () => createDb(Mem, `b${Date.now()}_${seq++}`);

async function seedTwo(db) {
  await db.putDevice({ identity: "mt:1", codeRaw: "MT:A", codeKind: "matter_qr", model: "A", matter: { vendorId: 1, productId: 2, passcode: 1 } });
  await db.putDevice({ identity: "mt:2", codeRaw: "MT:B", codeKind: "manual", model: "B" });
}

test("toCSV emits a header + one row per device, escaping commas", () => {
  const csv = toCSV(
    [{ identity: "mt:1", codeKind: "manual", codeRaw: "x", model: "Hue, white", matter: { passcode: 9 } }],
    () => "TypeA",
  );
  const lines = csv.split("\n");
  assert.match(lines[0], /^identity,codeKind/);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /"Hue, white"/); // comma-containing field quoted
});

test("summarizeImport triages new / update / conflict by updatedAt", async () => {
  const db = freshDb();
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "local" });
  const local = (await db.listDevices())[0];

  const backup = {
    format: "matterqr-backup",
    version: 1,
    docs: [
      { _id: "dev:mt:1", type: "device", identity: "mt:1", updatedAt: bump(local.updatedAt, +1000), model: "newer" },
      { _id: "dev:mt:9", type: "device", identity: "mt:9", updatedAt: "2020-01-01", model: "brand-new" },
      { _id: "dev:mt:1b", type: "device", identity: "mt:1b", updatedAt: "2000-01-01", model: "x" },
    ],
  };
  // mt:1 exists & imported is newer → update; mt:9/mt:1b don't exist → new
  const s = await summarizeImport(db, backup);
  assert.equal(s.new, 2);
  assert.equal(s.update, 1);
  assert.equal(s.conflict, 0);
  await db.destroy();
});

test("merge + newest-wins overwrites only when imported is newer", async () => {
  const db = freshDb();
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "local" });
  const local = (await db.listDevices())[0];
  const backup = {
    format: "matterqr-backup",
    version: 1,
    docs: [
      { _id: "dev:mt:1", type: "device", identity: "mt:1", codeKind: "manual", updatedAt: bump(local.updatedAt, +5000), model: "imported-newer" },
    ],
  };
  await applyImport(db, backup, { mode: "merge", conflict: "newer" });
  assert.equal((await db.getDevice("mt:1")).model, "imported-newer");
  await db.destroy();
});

test("merge + keepLocal never overwrites existing", async () => {
  const db = freshDb();
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "local" });
  const backup = {
    format: "matterqr-backup",
    version: 1,
    docs: [{ _id: "dev:mt:1", type: "device", identity: "mt:1", codeKind: "manual", updatedAt: "2999-01-01", model: "imported" }],
  };
  await applyImport(db, backup, { mode: "merge", conflict: "keepLocal" });
  assert.equal((await db.getDevice("mt:1")).model, "local");
  await db.destroy();
});

test("replace wipes then restores exactly the backup", async () => {
  const db = freshDb();
  await db.ensureSeed();
  await seedTwo(db);
  await db.putDevice({ identity: "mt:zap", codeKind: "manual", model: "to-be-removed" });

  // backup captured WITHOUT mt:zap
  const db2 = freshDb();
  await db2.ensureSeed();
  await seedTwo(db2);
  const backup = await db2.exportAll();

  await applyImport(db, backup, { mode: "replace" });
  const ids = (await db.listDevices()).map((d) => d.identity).sort();
  assert.deepEqual(ids, ["mt:1", "mt:2"]); // mt:zap gone, mt:1/mt:2 restored
  assert.equal((await db.listCategory("type")).length, 32);
  await db.destroy();
  await db2.destroy();
});

test("full round-trip through export → applyImport(replace) is stable", async () => {
  const db = freshDb();
  await db.ensureSeed();
  await seedTwo(db);
  const backup = await db.exportAll();
  await applyImport(db, backup, { mode: "replace" });
  assert.equal((await db.listDevices()).length, 2);
  await db.destroy();
});

function bump(iso, ms) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

test("exportAll({attachments:false}) drops photos; importing it keeps existing photos", async () => {
  const db = freshDb();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUg==", "base64");
  await db.putDevice({ identity: "p:1", codeKind: "manual", model: "withPhoto" }, { content_type: "image/png", data: png });

  const full = await db.exportAll();
  const lite = await db.exportAll({ attachments: false });
  const devFull = full.docs.find((d) => d._id === "dev:p:1");
  const devLite = lite.docs.find((d) => d._id === "dev:p:1");
  assert.ok(devFull._attachments?.photo?.data, "full export embeds the photo");
  assert.ok(!devLite._attachments, "lite export has no _attachments");

  // Restoring the photo-less backup must not wipe the photo already on disk.
  await applyImport(db, lite, { mode: "merge", conflict: "keepImport" });
  const raw = await db.raw.get("dev:p:1");
  assert.ok(raw._attachments?.photo, "existing photo preserved after metadata-only import");
  await db.destroy();
});
