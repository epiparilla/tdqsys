'use strict';
// Licence core unit tests.
//
// A fresh keypair is generated per run, so the suite never depends on - and
// never touches - the real production key, which must stay offline and
// double-backed.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const license = require('../license');
const { STATE } = license;

const INSTANCE = '8c8b6714-f300-413f-bf75-e1156662acfb';
const OTHER_INSTANCE = '11111111-2222-4333-8444-555555555555';
const TODAY = '2026-11-04';

// Throwaway keys. Never persisted, never the real one.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const KEYS = [{ keyId: 'k1', pem: PEM }];

const sign = (payloadBytes) => crypto.sign(null, payloadBytes, privateKey);

function issue(overrides = {}, keys = KEYS) {
  const payload = {
    v: 1,
    i: INSTANCE,
    c: 'Acme Auto Wash',
    b: '2026-11-01',
    x: '2026-11-06',
    n: 'a1b2c3d4e5f6',
    k: 'k1',
    ...overrides
  };
  return { code: license.buildCode(payload, sign), payload };
}

/** A local-time instant inside the licence term. */
const DURING = new Date(2026, 10, 3, 12, 0, 0).getTime();

// ---------------------------------------------------------------------------

describe('valid licences', () => {
  test('a well-formed licence inside its term is VALID', () => {
    const { code } = issue();
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.VALID, r.detail);
    assert.equal(r.notAfter, '2026-11-06');
  });

  test('it runs from the very first millisecond of the start date', () => {
    const { code } = issue();
    const { start } = license.dayBounds('2026-11-01');
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: start, keys: KEYS });
    assert.equal(r.state, STATE.VALID, `should be valid at 00:00:00.000 - ${r.detail}`);
  });

  test('it runs through the last millisecond of the end date', () => {
    const { code } = issue();
    const { end } = license.dayBounds('2026-11-06');
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: end, keys: KEYS });
    assert.equal(r.state, STATE.VALID, `should be valid at 23:59:59.999 - ${r.detail}`);
  });

  test('no licence at all is reported as NO_LICENCE', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const r = license.licenseStatus(empty, { instanceId: INSTANCE, now: DURING, keys: KEYS });
      assert.equal(r.state, STATE.NO_LICENCE);
      assert.equal(license.canWrite(r.state), false);
    }
  });
});

describe('expiry', () => {
  test('one millisecond after the end date it is EXPIRED', () => {
    const { code } = issue();
    const { end } = license.dayBounds('2026-11-06');
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: end + 1, keys: KEYS });
    assert.equal(r.state, STATE.EXPIRED, r.detail);
    assert.equal(r.notAfter, '2026-11-06');
  });

  test('an expired licence still serves customers read-only', () => {
    // The booth must keep showing numbers to people waiting; only the operator
    // is frozen.
    const { code } = issue();
    const { end } = license.dayBounds('2026-11-06');
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: end + 1, keys: KEYS });
    assert.equal(license.canWrite(r.state), false, 'writes must be blocked');
    assert.equal(license.canServeReadOnly(r.state), true, 'reads must still work');
  });

  test('a future-dated licence is NOT_YET_ACTIVE, not valid', () => {
    const { code } = issue({ b: '2026-12-01', x: '2026-12-06' });
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.NOT_YET_ACTIVE);
    assert.equal(license.canWrite(r.state), false);
  });

  test('day bounds are local midnight to the last millisecond', () => {
    const { start, end } = license.dayBounds('2026-11-06');
    const s = new Date(start);
    const e = new Date(end);
    assert.equal(s.getHours(), 0);
    assert.equal(s.getMinutes(), 0);
    assert.equal(s.getDate(), 6);
    assert.equal(e.getHours(), 23);
    assert.equal(e.getMinutes(), 59);
    assert.equal(e.getDate(), 6);
  });

  test('a licence spans the whole day regardless of the time it is checked', () => {
    // If we had stored exact instants, a licence issued in one timezone would
    // expire at the wrong hour for a machine in another.
    const { code } = issue({ b: '2026-11-06', x: '2026-11-06' });
    for (const hour of [0, 6, 12, 18, 23]) {
      const at = new Date(2026, 10, 6, hour, 30, 0).getTime();
      const r = license.licenseStatus(code, { instanceId: INSTANCE, now: at, keys: KEYS });
      assert.equal(r.state, STATE.VALID, `hour ${hour} should still be inside the term`);
    }
  });
});

describe('binding and tampering', () => {
  test('a licence issued for another installation is refused', () => {
    const { code } = issue();
    const r = license.licenseStatus(code, { instanceId: OTHER_INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.WRONG_LOCATION);
    assert.equal(license.canWrite(r.state), false);
  });

  test('an altered term is caught', () => {
    const { payload } = issue();
    // Extend the end date to 2036 but keep the signature over the ORIGINAL
    // bytes - the classic "just edit the expiry" attempt.
    const zlib = require('node:zlib');
    const tamperedBytes = zlib.deflateRawSync(
      Buffer.from(JSON.stringify({ ...payload, x: '2036-01-01' }), 'utf8'), { level: 9 });
    const originalBytes = zlib.deflateRawSync(
      Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
    const badCode = `${license.CODE_PREFIX}.` +
      Buffer.from(tamperedBytes).toString('base64url') + '.' +
      Buffer.from(sign(originalBytes)).toString('base64url');

    const r = license.licenseStatus(badCode, { instanceId: INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.INVALID, 'a forged expiry must not validate');
    assert.match(r.detail, /signature/i);
  });

  test('a licence signed by a different key is refused', () => {
    const other = crypto.generateKeyPairSync('ed25519');
    const payload = {
      v: 1, i: INSTANCE, c: 'Someone Else', b: '2026-11-01', x: '2026-11-06',
      n: 'ffffffffffff', k: 'k1'
    };
    const bytes = require('node:zlib')
      .deflateRawSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
    const code = `${license.CODE_PREFIX}.${Buffer.from(bytes).toString('base64url')}.` +
      Buffer.from(crypto.sign(null, bytes, other.privateKey)).toString('base64url');
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.INVALID);
  });

  test('a licence citing an untrusted key id is refused even if the signature is ours', () => {
    const payload = {
      v: 1, i: INSTANCE, c: 'Acme', b: '2026-11-01', x: '2026-11-06',
      n: 'aaaaaaaaaaaa', k: 'k2'
    };
    const code = license.buildCode(payload, sign);
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS });
    assert.equal(r.state, STATE.INVALID);
    assert.match(r.detail, /does not trust/);
  });

  test('a licence from an install with no trusted keys cannot validate', () => {
    // Fails closed: shipping with an empty key list must mean "closed".
    const { code } = issue();
    const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: [] });
    assert.equal(r.state, STATE.INVALID);
  });
});

describe('malformed input', () => {
  test('garbage, truncated and empty codes are rejected without throwing', () => {
    const { code } = issue();
    const bad = [
      'hello',
      'TDQS1.only-two-parts',
      `TDQS1.${code.split('.')[1]}`,
      code + '.extra',
      code.replace('TDQS1', 'TDQS9'),
      'TDQS1.!!!not-base64!!!.!!!',
      code.slice(0, 40),
      ' '
    ];
    for (const b of bad) {
      const r = license.licenseStatus(b, { instanceId: INSTANCE, now: DURING, keys: KEYS });
      assert.notEqual(r.state, STATE.VALID, `"${b}" must not validate`);
      assert.notEqual(r.state, STATE.WRONG_LOCATION);
    }
  });

  test('a payload with a nonsensical shape is rejected', () => {
    const cases = [
      { v: 99, i: INSTANCE, b: '2026-11-01', x: '2026-11-06', n: 'abcd', k: 'k1' },
      { v: 1, i: '', b: '2026-11-01', x: '2026-11-06', n: 'abcd', k: 'k1' },
      { v: 1, i: INSTANCE, b: '01/11/2026', x: '2026-11-06', n: 'abcd', k: 'k1' },
      { v: 1, i: INSTANCE, b: '2026-11-06', x: '2026-11-01', n: 'abcd', k: 'k1' },
      { v: 1, i: INSTANCE, b: '2026-11-01', x: '2026-11-06', n: 'a', k: 'k1' }
    ];
    for (const payload of cases) {
      const code = license.buildCode(payload, sign);
      const r = license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS });
      assert.equal(r.state, STATE.INVALID,
        `payload ${JSON.stringify(payload)} should be invalid, got ${r.state}`);
    }
  });

  test('validatePayload explains what is wrong', () => {
    assert.equal(license.validatePayload(null), 'malformed payload');
    assert.match(license.validatePayload({ v: 2, i: 'a', b: '2026-01-01', x: '2026-01-02', n: 'abcd', k: 'k1' }),
      /unsupported payload version/);
    assert.match(license.validatePayload({ v: 1, i: 'a', b: '2026-12-01', x: '2026-01-02', n: 'abcd', k: 'k1' }),
      /before the start/);
  });
});

describe('key rotation', () => {
  test('two trusted keys can coexist', () => {
    const k2 = crypto.generateKeyPairSync('ed25519');
    const keys2 = [
      ...KEYS,
      { keyId: 'k2', pem: k2.publicKey.export({ type: 'spki', format: 'pem' }).toString() }
    ];
    // Old licence still verifies against the old key.
    assert.equal(
      license.licenseStatus(issue().code, { instanceId: INSTANCE, now: DURING, keys: keys2 }).state,
      STATE.VALID
    );
    // New licence verifies against the new one.
    const fresh = license.buildCode({
      v: 1, i: INSTANCE, c: 'Acme', b: '2026-11-01', x: '2026-11-06', n: 'cccccccccccc', k: 'k2'
    }, (bytes) => crypto.sign(null, bytes, k2.privateKey));
    assert.equal(
      license.licenseStatus(fresh, { instanceId: INSTANCE, now: DURING, keys: keys2 }).state,
      STATE.VALID
    );
  });

  test('a key removed from the list stops verifying immediately', () => {
    const code = issue().code;
    assert.equal(license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: KEYS }).state, STATE.VALID);
    assert.notEqual(
      license.licenseStatus(code, { instanceId: INSTANCE, now: DURING, keys: [] }).state,
      STATE.VALID);
  });
});

describe('clock rollback guard', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tdqsys-clock-'));
  const a = path.join(dir, 'a.json');
  const b = path.join(dir, 'nested', 'b.json');

  // Real epoch-scale values. Using tiny numbers would be misleading: the
  // tolerance is 2 hours, so any span under ~7.2e6 ms is legitimately allowed.
  const BASE = Date.UTC(2026, 10, 4, 9, 0, 0);
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  test('a fresh install has nothing to compare against', () => {
    const r = license.clockCheck({ paths: [a, b], now: BASE });
    assert.equal(r.ok, true);
    assert.equal(r.known, false);
  });

  test('recording then reading back the same time passes', () => {
    license.clockRecord({ paths: [a, b], now: BASE });
    const r = license.clockCheck({ paths: [a, b], now: BASE });
    assert.equal(r.ok, true);
    assert.equal(r.known, true);
  });

  test('a small NTP-style correction is tolerated', () => {
    const r = license.clockCheck({ paths: [a, b], now: BASE - 60 * 1000 });
    assert.equal(r.ok, true, 'a one-minute correction must not trip the guard');
  });

  test('a correction inside the tolerance is still tolerated', () => {
    const r = license.clockCheck({ paths: [a, b], now: BASE - (license.CLOCK_TOLERANCE_MS - 1000) });
    assert.equal(r.ok, true);
  });

  test('winding the clock back to gain a licence day is refused', () => {
    // A six-day event licence is exactly the case this defends: subtracting
    // five days would otherwise resurrect an expired licence.
    const r = license.clockCheck({ paths: [a, b], now: BASE - (5 * DAY) });
    assert.equal(r.ok, false, 'rolling the clock back five days must be refused');
    assert.equal(r.behindBy, 5 * DAY);
  });

  test('the clock running forward is always fine', () => {
    const r = license.clockCheck({ paths: [a, b], now: BASE + (30 * DAY) });
    assert.equal(r.ok, true);
  });

  test('marks never move backwards', () => {
    license.clockRecord({ paths: [a, b], now: BASE + DAY });
    license.clockRecord({ paths: [a, b], now: BASE });
    const doc = JSON.parse(fs.readFileSync(a, 'utf8'));
    assert.equal(doc.maxSeen, BASE + DAY, 'a backwards record must not lower the mark');
  });

  test('either file alone still guards the clock', () => {
    // Deleting one is exactly what an attacker would try first.
    const r = license.clockCheck({ paths: [a, b], now: BASE - (5 * DAY) });
    assert.equal(r.ok, false, 'the surviving marks must still be enough');
  });

  test('a mark written to only one file is still honoured', () => {
    fs.rmSync(b, { force: true });
    license.clockRecord({ paths: [a], now: BASE + (10 * DAY) });
    fs.rmSync(a, { force: true });
    const only = path.join(dir, 'only.json');
    license.clockRecord({ paths: [only], now: BASE + (10 * DAY) });
    fs.rmSync(only, { force: true });
    // Nothing left anywhere: the guard simply has nothing to compare.
    const r = license.clockCheck({ paths: [a, b], now: BASE - (5 * DAY) });
    assert.equal(r.ok, true);
    assert.equal(r.known, false, 'with no marks there is nothing to compare against');
  });

  test('an unwritable path does not throw', () => {
    const r = license.clockRecord({ paths: [path.join(a, 'nested', 'x.json')], now: BASE });
    assert.equal(Array.isArray(r), true);
  });

  test('defaultClockPaths returns two distinct locations', () => {
    const paths = license.defaultClockPaths(path.resolve('/data/dir'));
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1],
      'two copies in one directory would be no defence at all');
    assert.ok(paths[0].startsWith(path.resolve('/data/dir')),
      'the first mark must live beside the data so it travels with backups');
  });
});

describe('code format', () => {
  test('a code is prefix.payload.signature', () => {
    const { code } = issue();
    const parts = code.split('.');
    assert.equal(parts.length, 3);
    assert.equal(parts[0], license.CODE_PREFIX);
  });

  test('a code is short enough to paste into a message', () => {
    const { code } = issue();
    assert.ok(code.length < 400, `code is ${code.length} characters`);
  });

  test('the payload survives an encode/decode round trip', () => {
    const { payload } = issue();
    const back = license.decodePayload(license.encodePayload(payload));
    assert.deepEqual(back, payload);
  });
});