'use strict';
// TDQSYS licensing - verification core.
//
// The client does not own the software; we do. They install, they request a
// term, we sign a licence, they enter it once. This module answers one
// question: "may this installation run, and until when?"
//
// Design notes that are load-bearing:
//
//  - Ed25519. We hold the private key offline and never ship it. The app only
//    carries public keys, which can verify a signature but cannot forge one.
//    Losing the private half is unrecoverable for already-shipped installs, so
//    the keygen step is documented as offline + double-backed.
//
//  - Term licences only, bound to the installation's instance id. One licence
//    per machine; a licence issued for another location is refused.
//
//  - Dates are plain YYYY-MM-DD, evaluated against the LOCAL clock, so a
//    licence runs 12:00am to 11:59pm on the days the operator chose regardless
//    of where the machine or the signer is. Baking exact timestamps would
//    shift the window by hours for anyone not in our timezone.
//
//  - Clock rollback. These are short licences - often five or six days for an
//    event - so setting the system date back is the obvious first attempt. The
//    highest timestamp we have ever seen is recorded in two separate files and
//    a clock that moves backwards is refused.
//
//  - Dual keys. Verification is keyed by the `k` (keyId) in the payload, so a
//    future rotation can trust old and new keys at once instead of forcing
//    every customer to re-activate.
//
// Everything here is pure and synchronous: no I/O except the clock files,
// which the caller controls so the engine and the desktop app can each use
// their own storage locations.

const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CODE_PREFIX = 'TDQS1';
const PAYLOAD_VERSION = 1;

// How far the clock may legitimately move backwards before we call it tampering.
// Absorbs NTP corrections and DST without opening a trivial bypass.
const CLOCK_TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Trusted public keys.
//
// PASTE THE PUBLIC KEY FROM `node tools/license.js keygen` HERE BEFORE THE
// FIRST RELEASE BUILD. An empty list means NO licence can ever validate, which
// is the safe failure: the app ships closed rather than open.
//
//   const TRUSTED_PUBLIC_KEYS = [
//     { keyId: 'k1', pem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n' },
//   ];
//
// Keep the old key alongside the new one during a rotation so existing
// customers keep working; drop it once the last old licence has expired.
const TRUSTED_PUBLIC_KEYS = Object.freeze([]);

const KEY_IDS = Object.freeze(TRUSTED_PUBLIC_KEYS.map((k) => k.keyId));

// Licence states, ordered from "cannot run" to "fully operational".
const STATE = Object.freeze({
  NO_LICENCE: 'no_licence',
  INVALID: 'invalid',
  WRONG_LOCATION: 'wrong_location',
  NOT_YET_ACTIVE: 'not_yet_active',
  EXPIRED: 'expired',
  VALID: 'valid'
});

/** True when this state permits the engine to accept writes. */
function canWrite(state) {
  return state === STATE.VALID;
}

/** True when the booth should still serve customers (board, phones, ads). */
function canServeReadOnly(state) {
  return state === STATE.VALID || state === STATE.EXPIRED;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(text) {
  return Buffer.from(text, 'base64url');
}

/**
 * Serialise a licence payload to its wire form:
 * deflate the JSON, then base64url. Compact enough to paste (~220 chars) and
 * the compression hides the structure from a casual glance.
 */
function encodePayload(payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  return b64urlEncode(zlib.deflateRawSync(json, { level: 9 }));
}

function decodePayload(encoded) {
  const json = zlib.inflateRawSync(b64urlDecode(encoded));
  return JSON.parse(json.toString('utf8'));
}

/**
 * Assemble a licence code from a payload and a signature over its exact bytes.
 * `signWith` is only used by the issuance tool; the app never signs.
 */
function buildCode(payload, signWith) {
  const payloadBytes = zlib.deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  const signature = signWith(payloadBytes);
  return `${CODE_PREFIX}.${b64urlEncode(payloadBytes)}.${b64urlEncode(signature)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANCE_RE = /^[0-9a-fA-F-]{1,64}$/;
const KEYID_RE = /^[A-Za-z0-9._-]{1,32}$/;

/** Validate the decoded payload's shape. Returns null if valid, else a reason. */
function validatePayload(p) {
  if (!p || typeof p !== 'object') return 'malformed payload';
  if (p.v !== PAYLOAD_VERSION) return `unsupported payload version ${p.v}`;
  if (typeof p.i !== 'string' || !INSTANCE_RE.test(p.i)) return 'malformed instance id';
  if (typeof p.b !== 'string' || !DATE_RE.test(p.b)) return 'malformed start date';
  if (typeof p.x !== 'string' || !DATE_RE.test(p.x)) return 'malformed end date';
  if (p.b > p.x) return 'end date is before the start date';
  if (typeof p.k !== 'string' || !KEYID_RE.test(p.k)) return 'malformed key id';
  if (typeof p.n !== 'string' || p.n.length < 4) return 'missing nonce';
  if (p.c !== undefined && typeof p.c !== 'string') return 'malformed customer name';
  return null;
}

/**
 * Local midnight and the last millisecond of the given YYYY-MM-DD.
 * Built from parts so it means "that day where the operator is".
 */
function dayBounds(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

// ---------------------------------------------------------------------------
// The core check
// ---------------------------------------------------------------------------

/**
 * Verify a licence code and classify it against this installation.
 *
 * @param {string|null|undefined} code   the licence code the client pasted
 * @param {object} opts
 * @param {string} opts.instanceId       this installation's immutable id
 * @param {Date|number} [opts.now]       injectable clock, for tests
 * @param {Array}  [opts.keys]           trusted keys, for tests
 * @returns {{state:string, payload?:object, detail?:string, notAfter?:string, notBefore?:string, keyId?:string}}
 */
function licenseStatus(code, opts = {}) {
  const now = opts.now === undefined ? Date.now()
    : (opts.now instanceof Date ? opts.now.getTime() : opts.now);
  const keys = opts.keys || TRUSTED_PUBLIC_KEYS;
  const keysById = new Map(keys.map((k) => [k.keyId, k]));

  const finish = (state, payload, detail) => ({
    state,
    payload,
    detail,
    notBefore: payload && payload.b,
    notAfter: payload && payload.x,
    keyId: payload && payload.k
  });

  if (typeof code !== 'string' || !code.trim()) {
    return finish(STATE.NO_LICENCE, null, 'No licence has been entered.');
  }

  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) {
    return finish(STATE.INVALID, null, 'That does not look like a TDQSYS licence code.');
  }

  let payload;
  let payloadBytes;
  try {
    payloadBytes = b64urlDecode(parts[1]);
    payload = JSON.parse(zlib.inflateRawSync(payloadBytes).toString('utf8'));
  } catch (e) {
    return finish(STATE.INVALID, null, 'The licence code is damaged or was copied incompletely.');
  }

  const shapeProblem = validatePayload(payload);
  if (shapeProblem) return finish(STATE.INVALID, payload, shapeProblem);

  // An empty trusted-key list means nothing can ever validate. Fail closed.
  if (!keysById.has(payload.k)) {
    return finish(STATE.INVALID, payload,
      `Licence was signed with key "${payload.k}", which this installation does not trust.`);
  }

  let signatureOk;
  try {
    signatureOk = crypto.verify(
      null,
      payloadBytes,
      keysById.get(payload.k).pem,
      b64urlDecode(parts[2])
    );
  } catch (e) {
    signatureOk = false;
  }
  if (!signatureOk) {
    return finish(STATE.INVALID, payload,
      'The licence signature is not valid. It may have been altered or issued for someone else.');
  }

  // Signature is good, so this really was issued by us. Only now do we care
  // whether it applies to this machine and this period.
  if (opts.instanceId && String(opts.instanceId).toLowerCase() !== payload.i.toLowerCase()) {
    return finish(STATE.WRONG_LOCATION, payload,
      'This licence was issued to a different installation.');
  }

  const { start, end } = dayBounds(payload.b);
  const endOfTerm = dayBounds(payload.x).end;

  if (now < start) {
    return finish(STATE.NOT_YET_ACTIVE, payload, `Licence begins on ${payload.b}.`);
  }
  if (now > endOfTerm) {
    return finish(STATE.EXPIRED, payload, `Licence ended on ${payload.x}.`);
  }

  return finish(STATE.VALID, payload, `Licensed to ${payload.c || 'this location'} until ${payload.x}.`);
}

// ---------------------------------------------------------------------------
// Clock rollback guard
// ---------------------------------------------------------------------------

/**
 * Default locations for the clock high-water marks. Two deliberately: an
 * attacker who notices one has to also find and edit the other, and a data
 * restore or uninstall that wipes one leaves the other standing.
 */
function defaultClockPaths(dataDir) {
  const home = path.join(os.homedir(), '.tdqsys');
  return [
    path.join(dataDir, 'license-clock.json'),
    path.join(home, 'license-clock.json')
  ];
}

/**
 * Refuse to operate if the clock has moved backwards past the tolerance.
 * Pure read - call clockRecord() separately to advance the marks.
 */
function clockCheck(opts = {}) {
  const now = opts.now === undefined ? Date.now()
    : (opts.now instanceof Date ? opts.now.getTime() : opts.now);
  const paths = opts.paths || [];
  const tolerance = opts.toleranceMs === undefined ? CLOCK_TOLERANCE_MS : opts.toleranceMs;

  let high = 0;
  for (const p of paths) {
    try {
      const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (doc && Number.isFinite(doc.maxSeen) && doc.maxSeen > high) high = doc.maxSeen;
    } catch (e) {
      // Missing or unreadable is normal on a fresh install - not a failure.
    }
  }
  if (!high) return { ok: true, highWater: 0, behindBy: 0, known: false };

  const behindBy = high - now;
  return {
    ok: behindBy <= tolerance,
    highWater: high,
    behindBy,
    known: true
  };
}

/**
 * Advance the high-water marks. Never moves them backwards, and a failure to
 * write one file is not fatal - the other still guards us.
 */
function clockRecord(opts = {}) {
  const now = opts.now === undefined ? Date.now()
    : (opts.now instanceof Date ? opts.now.getTime() : opts.now);
  const paths = opts.paths || [];
  const results = [];
  for (const p of paths) {
    try {
      let prev = 0;
      try {
        const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (doc && Number.isFinite(doc.maxSeen)) prev = doc.maxSeen;
      } catch (e) { /* fresh file */ }
      const next = Math.max(prev, now);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ maxSeen: next, updated: now }));
      results.push({ path: p, ok: true, value: next });
    } catch (e) {
      results.push({ path: p, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = {
  CODE_PREFIX,
  PAYLOAD_VERSION,
  CLOCK_TOLERANCE_MS,
  TRUSTED_PUBLIC_KEYS,
  KEY_IDS,
  STATE,
  canWrite,
  canServeReadOnly,
  encodePayload,
  decodePayload,
  buildCode,
  validatePayload,
  dayBounds,
  licenseStatus,
  clockCheck,
  clockRecord,
  defaultClockPaths
};