// Matter onboarding-payload decoder — the identity source for MatterQR.
//
// A Matter device carries two forms of the same setup credential:
//   1. a QR code   "MT:" + Base-38(11-byte bit-packed payload)   (Core Spec §5.1.3)
//   2. a manual pairing code, the numeric code printed beneath it (§5.1.4)
//
// Both encode the same 27-bit setup passcode, so we key inventory identity on
// the passcode: scanning a device's QR and later typing its manual code resolve
// to the SAME identity and dedup to one record. Only codes we can't decode
// ('other') fall back to their normalised raw string as identity.
//
// Pure functions, no DOM — importable by the browser app and by `node --test`.

// Matter Base-38 alphabet (Core Spec Table: 0-9, A-Z, '-', '.').
const B38 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";

// --- Base-38 → bytes -------------------------------------------------------
// Encoder maps 3 bytes → 5 chars, 2 → 4, 1 → 2. Each chunk is a little-endian
// base-38 number (first char least significant) emitted as little-endian bytes.
function base38Decode(s) {
  const bytes = [];
  for (let i = 0; i < s.length; ) {
    const remaining = s.length - i;
    let chunkLen;
    let byteCount;
    if (remaining >= 5) [chunkLen, byteCount] = [5, 3];
    else if (remaining === 4) [chunkLen, byteCount] = [4, 2];
    else if (remaining === 2) [chunkLen, byteCount] = [2, 1];
    else throw new Error(`invalid Base-38 length (${remaining} chars left)`);

    let value = 0;
    for (let k = chunkLen - 1; k >= 0; k--) {
      const idx = B38.indexOf(s[i + k]);
      if (idx < 0) throw new Error(`invalid Base-38 char '${s[i + k]}'`);
      value = value * 38 + idx;
    }
    for (let b = 0; b < byteCount; b++) bytes.push((value >>> (8 * b)) & 0xff);
    i += chunkLen;
  }
  return bytes;
}

// LSB-first bit reader over a byte array (bit 0 of byte 0 is read first).
function bitReader(bytes) {
  let offset = 0;
  return (count) => {
    let result = 0;
    for (let i = 0; i < count; i++) {
      const bit = (bytes[(offset + i) >> 3] >> ((offset + i) & 7)) & 1;
      result |= bit << i;
    }
    offset += count;
    // >>> 0 keeps 32-bit fields (passcode is 27 bits) unsigned.
    return result >>> 0;
  };
}

/**
 * Decode a "MT:..." Matter QR onboarding payload.
 * @returns decoded fields, or throws on malformed input.
 */
export function decodeQR(input) {
  const raw = input.trim();
  const body = raw.replace(/^MT:/i, "");
  const bytes = base38Decode(body);
  if (bytes.length < 11) throw new Error("Matter QR payload too short");

  const read = bitReader(bytes);
  const version = read(3);
  const vendorId = read(16);
  const productId = read(16);
  const customFlow = read(2);
  const discovery = read(8);
  const discriminator = read(12); // full 12-bit discriminator
  const passcode = read(27);

  return {
    kind: "matter_qr",
    raw,
    version,
    vendorId,
    productId,
    customFlow,
    discovery,
    discriminator,
    shortDiscriminator: (discriminator >> 8) & 0xf,
    passcode,
  };
}

// --- Manual pairing code ---------------------------------------------------
// Digit layout (§5.1.4.1), concatenated decimal groups + Verhoeff check digit:
//   d0     (1 digit)  : [VID_PID_present:1][discriminator bits 11-10 : 2]
//   d1..5  (5 digits) : [discriminator bits 9-8 : 2 @bit14][passcode bits 13-0]
//   d6..9  (4 digits) : passcode bits 26-14
//   (long) +5 digits VID, +5 digits PID
// Only the top 4 bits of the discriminator survive (the "short discriminator"),
// but the full 27-bit passcode is recoverable — which is what identity needs.
export function decodeManual(input) {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) throw new Error("manual code must be digits");
  if (digits.length !== 11 && digits.length !== 21) {
    throw new Error(`manual code must be 11 or 21 digits (got ${digits.length})`);
  }

  const checkOk = verhoeffValidate(digits);
  const n = (a, b) => parseInt(digits.slice(a, b), 10);

  const chunk1 = n(0, 1);
  const chunk2 = n(1, 6);
  const chunk3 = n(6, 10);

  const vidPidPresent = (chunk1 >> 2) & 1;
  const discHi = chunk1 & 0x3; // discriminator bits 11-10
  const discMid = (chunk2 >> 14) & 0x3; // discriminator bits 9-8
  const passcodeLow = chunk2 & 0x3fff; // passcode bits 13-0
  const passcodeHigh = chunk3 & 0x1fff; // passcode bits 26-14
  const passcode = ((passcodeHigh << 14) | passcodeLow) >>> 0;
  const shortDiscriminator = (discHi << 2) | discMid;

  const out = {
    kind: "manual",
    raw: input.trim(),
    shortDiscriminator,
    passcode,
    checkDigitValid: checkOk,
  };
  if (vidPidPresent && digits.length === 21) {
    out.vendorId = n(10, 15);
    out.productId = n(15, 20);
  }
  return out;
}

/**
 * Auto-detect and decode any scanned/typed code.
 * Never throws for user input: undecodable text returns kind 'other'.
 */
export function decode(input) {
  const s = (input ?? "").trim();
  if (!s) return { kind: "other", raw: s };
  try {
    if (/^MT:/i.test(s)) return decodeQR(s);
    const digits = s.replace(/[\s-]/g, "");
    if (/^\d+$/.test(digits) && (digits.length === 11 || digits.length === 21)) {
      return decodeManual(s);
    }
  } catch {
    // fall through to 'other' — we still record the raw code.
  }
  return { kind: "other", raw: s };
}

/** Persistable Matter fields for a device record (null for undecodable codes). */
export function matterFields(decoded) {
  if (!decoded || decoded.kind === "other") return null;
  const { vendorId, productId, discriminator, passcode, version, serial } = decoded;
  return { vendorId, productId, discriminator, passcode, version, serial };
}

/**
 * Build the 11-digit short-form manual pairing code (the number typed into a
 * commissioner) from a decoded payload. It needs the passcode + the full 12-bit
 * discriminator, both present in a QR — so a QR-registered device can display
 * its manual code even though only the QR was scanned. Returns null when those
 * fields are missing (e.g. a device registered from a manual code already has
 * the code as its raw string, and 'other' codes have neither).
 */
export function manualPairingCode(m) {
  if (!m || m.passcode == null || m.discriminator == null) return null;
  const shortDisc = (m.discriminator >> 8) & 0xf; // manual codes carry only the top 4 bits
  const chunk1 = (shortDisc >> 2) & 0x3; // VID/PID absent (short form) → top bit is 0
  const chunk2 = ((shortDisc & 0x3) << 14) | (m.passcode & 0x3fff);
  const chunk3 = (m.passcode >> 14) & 0x1fff;
  const body = `${chunk1}${String(chunk2).padStart(5, "0")}${String(chunk3).padStart(4, "0")}`;
  return body + verhoeffGenerate(body);
}

/** Normalise an 'other' raw code so trivial formatting differences dedup. */
export function normalizeRaw(raw) {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Stable dedup key. Matter codes (QR or manual) key on the shared passcode, so
 * both forms of one device collapse to a single record; others key on raw text.
 */
export function identity(decoded) {
  if (decoded && decoded.passcode != null) return `mt:${decoded.passcode}`;
  return `raw:${normalizeRaw(decoded?.raw)}`;
}

// --- Verhoeff (base-10) check digit, per Matter's ComputeCheckChar ----------
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// True when the trailing digit is a valid Verhoeff check over the preceding ones.
function verhoeffValidate(digits) {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    c = V_D[c][V_P[i % 8][Number(rev[i])]];
  }
  return c === 0;
}

// Inverse-permutation table: the check digit that makes verhoeffValidate pass.
const V_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

// Compute the Verhoeff check digit for a body of digits (the check occupies
// position 0, so the running index is offset by one vs. validation).
function verhoeffGenerate(digits) {
  let c = 0;
  const rev = digits.split("").reverse();
  for (let i = 0; i < rev.length; i++) {
    c = V_D[c][V_P[(i + 1) % 8][Number(rev[i])]];
  }
  return V_INV[c];
}
