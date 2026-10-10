// TDQSYS v2 - Licence storage and the gate decision.
//
// Kept separate from video_server.js so the rules can be exercised without
// booting a server, and so the desktop shell can ask the same question the
// engine does and never disagree with it.
//
// The licence lives OUTSIDE the app folder (~/.tdqsys) on purpose: reinstalling
// or updating must never make an operator re-enter a code they already paid
// for, and the app folder is routinely replaced wholesale by an update.

const fs = require('fs');
const os = require('os');
const path = require('path');
const license = require('../license');

// AF_LICENSE_DIR exists so tests (and a support engineer verifying a build)
// can point the whole mechanism somewhere disposable. In a real install it is
// never set, so the keys come from license.js as shipped.
const LICENCE_DIR = process.env.AF_LICENSE_DIR || path.join(os.homedir(), '.tdqsys');
const LICENCE_FILE = path.join(LICENCE_DIR, 'license.json');

function readStored() {
  try {
    const doc = JSON.parse(fs.readFileSync(LICENCE_FILE, 'utf8'));
    return doc && typeof doc.code === 'string' ? doc : null;
  } catch (e) {
    return null;
  }
}

function writeStored(code, instanceId) {
  fs.mkdirSync(LICENCE_DIR, { recursive: true });
  const doc = { code: String(code).trim(), instanceId, activated: Date.now() };
  fs.writeFileSync(LICENCE_FILE, JSON.stringify(doc, null, 2));
  return doc;
}

function clearStored() {
  try { fs.rmSync(LICENCE_FILE); } catch (e) { /* already gone */ }
}

/**
 * Two independent high-water marks, as license.defaultClockPaths does.
 *
 * Built from LICENCE_DIR rather than license.defaultClockPaths directly so a
 * test run - which sets AF_LICENSE_DIR to a temp folder - cannot write a clock
 * file into the operator's real home directory. In an install the two are the
 * same paths.
 */
function clockPaths(dataDir) {
  const dir = dataDir || LICENCE_DIR;
  return [
    path.join(dir, 'license-clock.json'),
    path.join(LICENCE_DIR, 'license-clock.json')
  ];
}

/** Which public keys to trust. File override is a verification hook only. */
function trustedKeys() {
  const f = process.env.AF_TRUSTED_KEYS_FILE;
  if (!f) return license.TRUSTED_PUBLIC_KEYS;
  try {
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(doc) ? doc : license.TRUSTED_PUBLIC_KEYS;
  } catch (e) {
    return license.TRUSTED_PUBLIC_KEYS;
  }
}

/**
 * Full status for this installation.
 *
 * `clockRollback` is reported separately rather than folded into `state`,
 * because a rolled-back clock must not silently become EXPIRED: the operator
 * needs to be told the machine is lying about the time, not that their
 * licence quietly lapsed.
 */
function status(instanceId, opts = {}) {
  const stored = opts.stored === undefined ? readStored() : opts.stored;
  const now = opts.now === undefined ? Date.now() : opts.now;
  const keys = opts.keys || trustedKeys();

  const st = license.licenseStatus(stored ? stored.code : '', { instanceId, now, keys });

  let clockRollback = null;
  if (opts.clock === false) {
    // Tests that pin `now` do not want their own high-water mark written.
  } else {
    const paths = clockPaths(opts.dataDir);
    const check = license.clockCheck({ now, paths });
    if (!check.ok) {
      clockRollback = check;
      // A rolled-back clock cannot be trusted to judge expiry either way.
      // Stay read-only rather than guess.
      if (st.state === license.STATE.VALID || st.state === license.STATE.EXPIRED) {
        st.state = license.STATE.INVALID;
        st.detail = `This machine's clock was rolled back by ${check.rolledBackByMs} ms. ` +
          'Licences cannot be checked until the date and time are correct.';
      }
    } else {
      license.clockRecord({ now, paths });
    }
  }

  const p = st.payload || {};
  return {
    state: st.state,
    detail: st.detail,
    // Dates are surfaced verbatim so the UI can show exactly what was signed.
    from: p.b || null,
    until: p.x || null,
    customer: p.c || null,
    keyId: p.k || null,
    instanceId: p.i || null,
    activated: stored ? stored.activated : null,
    hasLicence: !!stored,
    canWrite: license.canWrite(st.state) && !clockRollback,
    canServe: license.canServeReadOnly(st.state) && !clockRollback,
    clockRollback,
    licenceFile: LICENCE_FILE
  };
}

/**
 * Validate a code without storing it, for the "test before I commit" flow.
 * Returns the same status shape so the caller renders one thing.
 */
function check(code, instanceId, opts = {}) {
  const keys = opts.keys || trustedKeys();
  const now = opts.now === undefined ? Date.now() : opts.now;
  const st = license.licenseStatus(code || '', { instanceId, now, keys });
  const p = st.payload || {};
  return {
    state: st.state,
    detail: st.detail,
    from: p.b || null,
    until: p.x || null,
    customer: p.c || null,
    keyId: p.k || null,
    instanceId: p.i || null,
    canWrite: license.canWrite(st.state),
    canServe: license.canServeReadOnly(st.state)
  };
}

/**
 * Store a code. Only a code that is currently VALID is written - an expired or
 * wrong-location code must not overwrite a working licence. The caller reads
 * the returned status to report why.
 */
function activate(code, instanceId, opts = {}) {
  const result = check(code, instanceId, opts);
  if (result.state !== license.STATE.VALID) return { stored: false, status: result };
  writeStored(code, instanceId);
  return { stored: true, status: status(instanceId, opts) };
}

module.exports = {
  LICENCE_DIR,
  LICENCE_FILE,
  clockPaths,
  readStored,
  clearStored,
  trustedKeys,
  status,
  check,
  activate
};