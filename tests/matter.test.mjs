// Run: node --test tests/matter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decode,
  decodeQR,
  decodeManual,
  identity,
  normalizeRaw,
} from "../js/matter.js";

// Canonical CHIP onboarding example: QR + manual code for the same device.
// Passcode 20202021, discriminator 3840 (0xF00).
const QR = "MT:Y.K9042C00KA0648G00";
const MANUAL = "34970112332";

test("decodeQR extracts the canonical passcode + discriminator", () => {
  const d = decodeQR(QR);
  assert.equal(d.kind, "matter_qr");
  assert.equal(d.passcode, 20202021);
  assert.equal(d.discriminator, 3840);
});

test("decodeManual recovers the full 27-bit passcode", () => {
  const d = decodeManual(MANUAL);
  assert.equal(d.kind, "manual");
  assert.equal(d.passcode, 20202021);
  assert.equal(d.shortDiscriminator, 0xf); // top 4 bits of 0xF00
  assert.equal(d.checkDigitValid, true);
});

test("QR and manual code of one device share an identity (dedup key)", () => {
  assert.equal(identity(decodeQR(QR)), identity(decodeManual(MANUAL)));
  assert.equal(identity(decode(QR)), "mt:20202021");
});

test("decode auto-detects form and never throws on junk", () => {
  assert.equal(decode(QR).kind, "matter_qr");
  assert.equal(decode(MANUAL).kind, "manual");
  assert.equal(decode("hello world").kind, "other");
  assert.equal(decode("").kind, "other");
  assert.equal(decode("1234").kind, "other"); // wrong length → not a manual code
});

test("'other' codes key on normalised raw text", () => {
  const d = decode("  Foo-Bar Baz ");
  assert.equal(d.kind, "other");
  assert.equal(identity(d), `raw:${normalizeRaw("  Foo-Bar Baz ")}`);
  assert.equal(identity(decode("foo-bar   baz")), identity(decode("FOO-BAR BAZ")));
});

test("dashes/spaces in a manual code are tolerated", () => {
  assert.equal(decodeManual("3497-011-2332").passcode, 20202021);
});

test("a corrupted manual code is flagged but still decodes fields", () => {
  // flip the check digit; still parseable, checkDigitValid=false
  const bad = "34970112331";
  const d = decodeManual(bad);
  assert.equal(d.checkDigitValid, false);
});
