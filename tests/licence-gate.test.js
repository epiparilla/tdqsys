'use strict';
// Phase 3: the engine's licence gate.
//
// These are the tests that decide whether a booth can still be worked. They
// drive a real spawned engine over HTTP rather than calling the gate directly,
// because the thing worth knowing is what a customer sitting in front of the
// dashboard actually gets back.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const license = require('../license');
const { startEngine } = require('./helpers');

const BODY = { queues: { brand1: { 1: 7 } }, config: { site: 'x' } };

async function save(base, body = BODY) {
  return fetch(`${base}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** Install a licence directly, the way one that was valid yesterday is. */
function writeLicence(engine, code) {
  fs.writeFileSync(
    path.join(engine.licenseDir, 'license.json'),
    JSON.stringify({ code, instanceId: engine.instanceId, activated: Date.now() })
  );
}

describe('unlicensed engine', () => {
  let engine;
  before(async () => { engine = await startEngine({ licensed: false }); });
  after(async () => { await engine.stop(); });

  test('reports no licence and refuses to write', async () => {
    const st = await engine.status();
    assert.equal(st.state, license.STATE.NO_LICENCE);
    assert.equal(st.canWrite, false);
    assert.equal(st.hasLicence, false);
  });

  test('refuses /api/save', async () => {
    const r = await save(engine.base);
    assert.equal(r.status, 403);
    const doc = await r.json();
    assert.equal(doc.canWrite, false);
    assert.equal(doc.licenceState, license.STATE.NO_LICENCE);
  });

  test('refuses /api/import', async () => {
    const r = await fetch(`${engine.base}/api/import?name=x.mp4`, {
      method: 'POST', body: Buffer.from('not a real video')
    });
    assert.equal(r.status, 403);
  });

  test('refuses /api/clearVideos', async () => {
    const r = await fetch(`${engine.base}/api/clearVideos`, { method: 'POST' });
    assert.equal(r.status, 403);
  });

  test('still serves reads, so the booth is usable at all', async () => {
    const data = await fetch(`${engine.base}/api/data`);
    assert.equal(data.status, 200);
    const doc = await data.json();
    assert.ok(doc.queues, 'the board must still render');
  });

  test('still serves the video playlist', async () => {
    const r = await fetch(`${engine.base}/api/videos`);
    assert.equal(r.status, 200);
  });

  test('refuses a licence issued to a different instance', async () => {
    const code = engine.issue('00000000-0000-4000-8000-000000000000', '2000-01-01', '2099-12-31');
    const r = await engine.activate(code);
    assert.equal(r.stored, false);
    assert.equal(r.status.state, license.STATE.WRONG_LOCATION);
  });

  test('refuses a future-dated licence that has not started yet', async () => {
    const code = engine.issue(engine.instanceId, '2099-01-01', '2099-12-31');
    const r = await engine.activate(code);
    assert.equal(r.stored, false);
    assert.equal(r.status.state, license.STATE.NOT_YET_ACTIVE);
  });

  test('refuses a tampered code', async () => {
    const good = engine.issue(engine.instanceId, '2000-01-01', '2099-12-31');
    // Flip one character of the payload; the signature no longer matches.
    const parts = good.split('.');
    const body = parts[1];
    parts[1] = (body[5] === 'A' ? 'B' : 'A') + body.slice(1);
    const r = await engine.activate(parts.join('.'));
    assert.equal(r.stored, false);
    assert.ok(
      [license.STATE.INVALID, license.STATE.WRONG_LOCATION].includes(r.status.state),
      `unexpected state ${r.status.state}`
    );
  });

  test('refuses nonsense without crashing', async () => {
    for (const junk of ['', 'hello', 'TDQS1.a.b', 'TDQS1.@@@.###']) {
      const r = await engine.activate(junk);
      assert.equal(r.stored, false, `"${junk}" was accepted`);
    }
  });
});

describe('licensed engine', () => {
  let engine;
  before(async () => { engine = await startEngine(); });
  after(async () => { await engine.stop(); });

  test('the harness really is licensed, or these tests prove nothing', async () => {
    const st = await engine.status();
    assert.equal(st.state, license.STATE.VALID, st.detail);
    assert.equal(st.canWrite, true);
  });

  test('accepts a save', async () => {
    assert.equal((await save(engine.base)).status, 200);
  });

  test('a renewal replaces the stored licence', async () => {
    const renewal = engine.issue(engine.instanceId, '2000-01-01', '2099-12-31', 'Renewed Ltd');
    const r = await engine.activate(renewal);
    assert.equal(r.stored, true);
    assert.equal(r.status.customer, 'Renewed Ltd');
  });

  test('refuses to store a bad code over a working licence', async () => {
    const bad = engine.issue('00000000-0000-4000-8000-000000000000', '2000-01-01', '2099-12-31');
    const r = await engine.activate(bad);
    assert.equal(r.stored, false);
    const st = await engine.status();
    assert.equal(st.state, license.STATE.VALID, 'the good licence must survive a bad paste');
    assert.equal(st.customer, 'Renewed Ltd');
  });

  test('describe returns the instance id the customer quotes back', async () => {
    const r = await fetch(`${engine.base}/api/license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ describe: true })
    });
    const doc = await r.json();
    assert.equal(doc.instanceId, engine.instanceId);
  });
});

describe('expired licence', () => {
  let engine;
  before(async () => { engine = await startEngine(); });
  after(async () => { await engine.stop(); });

  test('reads keep working, writes return 403', async () => {
    // A licence that was valid when entered and has since lapsed.
    writeLicence(engine, engine.issue(engine.instanceId, '2020-01-01', '2020-01-06'));

    const st = await engine.status();
    assert.equal(st.state, license.STATE.EXPIRED, st.detail);
    assert.equal(st.canWrite, false);
    assert.equal(st.canServe, true, 'an expired booth must still serve cars');

    assert.equal((await fetch(`${engine.base}/api/data`)).status, 200);
    assert.equal((await fetch(`${engine.base}/api/config`)).status, 200);
    assert.equal((await fetch(`${engine.base}/api/videos`)).status, 200);

    const s = await save(engine.base);
    assert.equal(s.status, 403);
    assert.equal((await s.json()).licenceState, license.STATE.EXPIRED);

    assert.equal((await fetch(`${engine.base}/api/import?name=a.mp4`, { method: 'POST' })).status, 403);
    assert.equal((await fetch(`${engine.base}/api/clearVideos`, { method: 'POST' })).status, 403);
  });

  test('refused saves leave the stored queue untouched', async () => {
    const before_ = await (await fetch(`${engine.base}/api/data`)).json();
    await save(engine.base, { queues: { brand1: { 1: 99 } } });
    const after_ = await (await fetch(`${engine.base}/api/data`)).json();
    assert.deepEqual(after_.queues, before_.queues);
  });

  test('the expiry date is surfaced so Settings can show it', async () => {
    const st = await engine.status();
    assert.equal(st.until, '2020-01-06');
  });

  test('a renewal re-opens writes', async () => {
    const r = await engine.activate(engine.issue(engine.instanceId, '2000-01-01', '2099-12-31'));
    assert.equal(r.stored, true);
    assert.equal((await save(engine.base)).status, 200);
  });
});

describe('clock rollback', () => {
  let engine;
  before(async () => { engine = await startEngine(); });
  after(async () => { await engine.stop(); });

  test('a machine wound back is refused even with a valid licence', async () => {
    const future = Date.now() + 30 * 86400000; // 30 days ahead
    for (const f of [
      path.join(engine.dataDir, 'license-clock.json'),
      path.join(engine.licenseDir, 'license-clock.json')
    ]) {
      fs.writeFileSync(f, JSON.stringify({ maxSeen: future, updated: future }));
    }

    const st = await engine.status();
    assert.ok(st.clockRollback, 'the rollback was not detected');
    assert.equal(st.canWrite, false, 'a rolled-back machine must not be able to write');
    assert.notEqual(st.state, license.STATE.VALID);

    const r = await save(engine.base);
    assert.equal(r.status, 403);
    assert.match((await r.json()).licenceDetail, /clock/i);
  });

  test('reads are still served so the booth keeps working', async () => {
    assert.equal((await fetch(`${engine.base}/api/data`)).status, 200);
  });

  test('restoring the real time clears the refusal', async () => {
    for (const f of [
      path.join(engine.dataDir, 'license-clock.json'),
      path.join(engine.licenseDir, 'license-clock.json')
    ]) {
      fs.rmSync(f);
    }
    const st = await engine.status();
    assert.equal(st.clockRollback, null);
    assert.equal(st.canWrite, true);
  });
});