// Run: node --test tests/db.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import PouchDB from "pouchdb";
import memory from "pouchdb-adapter-memory";
import { createDb } from "../js/db.js";

PouchDB.plugin(memory);
const Mem = PouchDB.defaults({ adapter: "memory" });

let seq = 0;
function freshDb() {
  return createDb(Mem, `t${Date.now()}_${seq++}`);
}

test("ensureSeed populates type + status once, idempotently", async () => {
  const db = freshDb();
  await db.ensureSeed();
  await db.ensureSeed(); // second run must not duplicate
  const types = await db.listCategory("type");
  const statuses = await db.listCategory("status");
  assert.equal(types.length, 5);
  assert.equal(statuses.length, 4);
  assert.ok(types.some((t) => t.name === "조명"));
  await db.destroy();
});

test("addCategory dedups case-insensitively", async () => {
  const db = freshDb();
  const a = await db.addCategory("loc", "거실");
  const b = await db.addCategory("loc", "거실"); // exact dup
  const c = await db.addCategory("loc", "  거실  "); // padded dup
  assert.equal(a.id, b.id);
  assert.equal(a.id, c.id);
  assert.equal((await db.listCategory("loc")).length, 1);
  await db.destroy();
});

test("putDevice keys on identity → re-scan edits, never duplicates", async () => {
  const db = freshDb();
  await db.putDevice({ identity: "mt:20202021", codeRaw: "MT:...", codeKind: "matter_qr" });
  // same identity again, now with metadata → update, not a new doc
  await db.putDevice({
    identity: "mt:20202021",
    codeKind: "matter_qr",
    model: "Hue A19",
    locationId: "cat:loc:x",
  });
  const all = await db.listDevices();
  assert.equal(all.length, 1);
  assert.equal(all[0].model, "Hue A19");
  assert.equal(all[0].codeRaw, "MT:..."); // preserved across update
  assert.ok(all[0].createdAt <= all[0].updatedAt);
  await db.destroy();
});

test("getDevice returns null for unknown identity", async () => {
  const db = freshDb();
  assert.equal(await db.getDevice("mt:999"), null);
  await db.destroy();
});

test("photo attachment round-trips and can be removed", async () => {
  const db = freshDb();
  const dataB64 = Buffer.from("fake-jpeg-bytes").toString("base64");
  await db.putDevice(
    { identity: "mt:1", codeKind: "manual" },
    { content_type: "image/jpeg", data: dataB64 },
  );
  const blob = await db.getPhoto("mt:1");
  assert.ok(blob, "photo should exist");

  // edit without touching photo (undefined) keeps it
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "x" });
  assert.ok(await db.getPhoto("mt:1"), "photo survives metadata edit");

  // explicit null removes it
  await db.putDevice({ identity: "mt:1", codeKind: "manual" }, null);
  assert.equal(await db.getPhoto("mt:1"), null);
  await db.destroy();
});

test("exportAll → clearData → upsertRaw restores devices + categories", async () => {
  const db = freshDb();
  await db.ensureSeed();
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "A" });
  await db.putDevice({ identity: "mt:2", codeKind: "manual", model: "B" });

  const backup = await db.exportAll();
  assert.equal(backup.docs.filter((d) => d.type === "device").length, 2);
  assert.ok(backup.docs.every((d) => !("_rev" in d)), "export strips _rev");

  await db.clearData();
  assert.equal((await db.listDevices()).length, 0);
  assert.equal((await db.listCategory("type")).length, 0);

  for (const doc of backup.docs) await db.upsertRaw(doc);
  assert.equal((await db.listDevices()).length, 2);
  assert.equal((await db.listCategory("type")).length, 5);
  await db.destroy();
});

test("upsertRaw resolves _rev so a re-import is conflict-free", async () => {
  const db = freshDb();
  await db.putDevice({ identity: "mt:1", codeKind: "manual", model: "A" });
  const backup = await db.exportAll();
  // import the same doc again (merge/overwrite path) — must not throw on conflict
  for (const doc of backup.docs) await db.upsertRaw({ ...doc, model: "A2" });
  const info = await db.raw.info();
  assert.equal(info.doc_count, 1);
  assert.equal((await db.listDevices())[0].model, "A2");
  await db.destroy();
});
