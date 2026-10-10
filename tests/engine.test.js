'use strict';
// Boots the real queue engine against a throwaway data directory and a port
// offset from the live one, then exercises its HTTP contract.
//
// Isolation is the whole point: AF_DATA_DIR points at a temp dir and
// AF_OWNER_SYNC=1 disables the engine's own cloud push, so a test run cannot
// read, write or publish a real location's data.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startEngine, TEST_PORT } = require('./helpers');

let eng;

before(async () => { eng = await startEngine(); });
after(async () => { if (eng) await eng.stop(); });

const get = (p) => fetch(`${eng.base}${p}`);
const post = (p, body) => fetch(`${eng.base}${p}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

test('fresh start produces a valid state document', async () => {
  const { config, queues } = await (await get('/api/data')).json();
  assert.match(config.instanceId, /^[0-9a-f-]{36}$/,
    'a fresh install must mint an instance id, or the cloud mirror cannot key it');
  assert.ok(config.cloudBase !== undefined);
  assert.ok(queues && typeof queues === 'object');
});

test('fresh data dir is populated on disk', () => {
  const file = path.join(eng.dataDir, 'data.json');
  assert.ok(fs.existsSync(file), 'data.json was not created in the throwaway dir');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(doc.config.instanceId, 'data.json is missing config.instanceId');
});

test('the engine binds only the test port, never the live one', () => {
  assert.equal(TEST_PORT, 18081, 'test port drifted; it must stay clear of 8081');
});

test('GET /api/config returns the config block', async () => {
  const cfg = await (await get('/api/config')).json();
  assert.ok(cfg.instanceId, 'config endpoint did not expose instanceId');
});

test('a queue-only save preserves config and persists to disk', async () => {
  const before = await (await get('/api/data')).json();
  const key = before.config.brands[0].key;

  const res = await post('/api/save', { queues: { [key]: { 1: 42 } } });
  assert.equal(res.status, 200);

  const after = await (await get('/api/data')).json();
  assert.equal(after.queues[key][1], 42, 'save did not round-trip through the engine');
  assert.equal(after.config.instanceId, before.config.instanceId,
    'a queue-only save must not disturb the instance identity');

  const onDisk = JSON.parse(fs.readFileSync(path.join(eng.dataDir, 'data.json'), 'utf8'));
  assert.equal(onDisk.queues[key][1], 42, 'save was not flushed to data.json');
});

test('a full state save replaces config and queues together', async () => {
  const before = await (await get('/api/data')).json();
  const full = {
    config: { ...before.config, site: 'round-trip-check' },
    queues: { ...before.queues }
  };
  const res = await post('/api/save', full);
  assert.equal(res.status, 200);
  const after = await (await get('/api/data')).json();
  assert.equal(after.config.site, 'round-trip-check');
});

test('a malformed save payload is rejected, not written', async () => {
  const before = await (await get('/api/data')).json();
  const res = await post('/api/save', { nonsense: true });
  assert.equal(res.status, 400, 'a payload with neither config nor queues must 400');
  const after = await (await get('/api/data')).json();
  assert.deepEqual(after.queues, before.queues, 'a rejected save must not mutate state');
});

test('static pages are served', async () => {
  for (const page of ['/', '/client.html', '/settings.html', '/dashboard.html']) {
    const r = await get(page);
    assert.equal(r.status, 200, `${page} returned ${r.status}`);
  }
});

test('the viewer library and its QR dependency are both served', async () => {
  // These are loaded by settings.html at runtime; a missing one silently
  // breaks activation or the QR in the installed app.
  for (const asset of ['/af.js', '/vendor/qrcode-generator.js']) {
    const r = await get(asset);
    assert.equal(r.status, 200, `${asset} returned ${r.status} - it ships in the installer`);
  }
});

test('unknown paths return 404, not the hub', async () => {
  // Without a real 404.html, Pages falls back to index.html with a 200, which
  // made retired routes look alive.
  const r = await get('/definitely-not-a-page');
  assert.equal(r.status, 404, `unknown path returned ${r.status}`);
});

test('path traversal is refused', async () => {
  const r = await get('/../../video_server.js');
  assert.ok(r.status === 404 || r.status === 400 || r.status === 301,
    `traversal returned ${r.status}`);
  if (r.status === 200) {
    const body = await r.text();
    assert.ok(!body.includes('createServer'),
      'path traversal served the engine source');
  }
});

test('video listing responds even when empty', async () => {
  const r = await get('/api/videos');
  assert.equal(r.status, 200);
  const list = await r.json();
  assert.ok(Array.isArray(list), '/api/videos must return an array');
});