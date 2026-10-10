'use strict';
// Exercises the Cloudflare Pages Functions (api/data.js, api/save.js) in a
// sandbox, without deploying.
//
// The bug this guards: api/data.js used to accept any `id` string. A malformed
// one - a truncated bookmark, a stray "?" from a pasted cache-buster - produced
// a KV key that never existed, so the endpoint answered 200 with a fresh
// default state. The viewer rendered an empty "Brand 1 / Model 1" board that
// looked exactly like data loss.
//
// Also covers the tenant-isolation rule that makes two locations safe: one
// instance id must never see another's record.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');

const VALID_ID = '8c8b6714-f300-413f-bf75-e1156662acfb';
const OTHER_ID = '11111111-2222-4333-8444-555555555555';

/** In-memory stand-in for Workers KV. */
function makeKv(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    _keys: () => [...store.keys()],
    binding: {
      async get(key) {
        return store.has(key) ? store.get(key) : null;
      },
      async put(key, value) { store.set(key, value); },
      async delete(key) { store.delete(key); }
    }
  };
}

/**
 * Run a Pages Function body with a stubbed context.
 * The files import from shared/config.js, which the Pages bundler inlines;
 * here we resolve that import by hand.
 */
async function runFunction(file, { url, method = 'GET', body = null, kv = makeKv() }) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');

  const configSrc = fs.readFileSync(path.join(ROOT, 'shared', 'config.js'), 'utf8');
  // shared/config.js is CommonJS; the Pages bundler inlines it, so we evaluate
  // it ourselves and hand the exports to the function body.
  const moduleObj = { exports: {} };
  const configSandbox = { console, module: moduleObj, exports: moduleObj.exports };
  configSandbox.globalThis = configSandbox;
  vm.createContext(configSandbox);
  vm.runInContext(configSrc, configSandbox, { filename: 'shared/config.js' });
  const sharedExports = moduleObj.exports;

  const sandbox = {
    __shared: sharedExports,
    console,
    URL,
    URLSearchParams,
    Response,
    Request,
    Headers,
    TextEncoder,
    TextDecoder
  };
  vm.createContext(sandbox);
  // Rewrite the bare relative import to use the already-evaluated exports, and
  // turn the exported handler into a plain function we can call.
  const patched = src
    .replace(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+["'];?/, (_m, names) =>
      `const {${names}} = __shared;`)
    .replace(/export\s+async\s+function\s+onRequest/, 'async function onRequest');
  vm.runInContext(patched, sandbox, { filename: file });

  const headers = { 'Content-Type': 'application/json' };
  const context = {
    request: {
      method,
      url,
      headers: new Map(Object.entries(headers)),
      json: async () => { if (body === null) throw new Error('no body'); return body; }
    },
    env: { TDQSYS_QUEUE_DATA: kv.binding },
    waitUntil() {}, passThroughOnException() {}
  };

  const res = await sandbox.onRequest(context);
  const text = res ? await res.text() : '';
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res?.status, json, text, kv };
}

// --- GET /api/data -----------------------------------------------------------

test('GET /api/data returns 400 for a malformed instance id', async () => {
  const cases = [
    `${VALID_ID}?cb=123`,            // two '?' - a pasted cache-buster
    'not-a-uuid',
    'zzzz',
    'abc def',
    'ABCDEF!',
    `${VALID_ID}?id=other`
  ];
  for (const bad of cases) {
    const r = await runFunction('functions/api/data.js', {
      url: `https://example.com/api/data?id=${bad}`
    });
    assert.equal(r.status, 400,
      `id="${bad}" should be rejected with 400, got ${r.status}. ` +
      'A bad id used to return a fresh default board that looked like data loss.');
  }
});

test('a trailing space is trimmed, not rejected', async () => {
  // A bookmark with a stray trailing space is a common typo. Trimming it
  // resolves the real record instead of handing the user an empty board.
  const stored = { config: { instanceId: VALID_ID, site: 'loc-a' }, queues: { brand1: { 1: 7 } } };
  const kv = makeKv({ [`instances/${VALID_ID}/state`]: JSON.stringify(stored) });
  const r = await runFunction('functions/api/data.js', {
    url: `https://example.com/api/data?id=${VALID_ID}%20`,
    kv
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.queues.brand1[1], 7,
    'a trailing space should trim to the real record, not fall back to defaults');
  assert.deepEqual(kv._keys(), [`instances/${VALID_ID}/state`],
    'the trimmed id must not create a second key');
});

test('GET /api/data reads the instance key for a valid id', async () => {
  const stored = { config: { instanceId: VALID_ID, site: 'loc-a' }, queues: { brand1: { 1: 7 } } };
  const kv = makeKv({ [`instances/${VALID_ID}/state`]: JSON.stringify(stored) });

  const r = await runFunction('functions/api/data.js', {
    url: `https://example.com/api/data?id=${VALID_ID}`,
    kv
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.queues.brand1[1], 7);
  assert.ok(kv._keys().includes(`instances/${VALID_ID}/state`),
    'a valid id must read instances/<id>/state');
});

test('one instance id cannot read another instance record', async () => {
  const kv = makeKv({
    [`instances/${VALID_ID}/state`]: JSON.stringify({ config: { instanceId: VALID_ID }, queues: { brand1: { 1: 7 } } })
  });
  const r = await runFunction('functions/api/data.js', {
    url: `https://example.com/api/data?id=${OTHER_ID}`,
    kv
  });
  assert.notEqual(r.json?.queues?.brand1?.[1], 7,
    'an unknown-but-valid id returned another location\'s queue numbers');
  assert.equal(r.json.config.instanceId, OTHER_ID,
    'an unknown id must be echoed back so the viewer can tell it is unseeded');
});

test('a legacy ?site= link still resolves for older bookmarks', async () => {
  const kv = makeKv({
    'sites/auto-01/state': JSON.stringify({ config: { instanceId: VALID_ID, site: 'auto-01' }, queues: {} })
  });
  const r = await runFunction('functions/api/data.js', {
    url: 'https://example.com/api/data?site=auto-01',
    kv
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.config.site, 'auto-01');
});

test('GET /api/data answers OPTIONS for CORS preflight', async () => {
  const r = await runFunction('functions/api/data.js', {
    url: 'https://example.com/api/data', method: 'OPTIONS'
  });
  assert.equal(r.status, 204);
});

// --- POST /api/save -----------------------------------------------------------

test('POST /api/save rejects a malformed id instead of writing a junk key', async () => {
  const kv = makeKv();
  const r = await runFunction('functions/api/save.js', {
    url: `https://example.com/api/save?id=${VALID_ID}?cb=1`,
    method: 'POST',
    body: { config: {}, queues: {} },
    kv
  });
  assert.equal(r.status, 400, `expected 400, got ${r.status}`);
  assert.deepEqual(kv._keys(), [],
    `a rejected save wrote keys: ${kv._keys()}`);
});

test('POST /api/save writes instances/<id>/state and pins the identity', async () => {
  const kv = makeKv();
  const r = await runFunction('functions/api/save.js', {
    url: `https://example.com/api/save?id=${VALID_ID}`,
    method: 'POST',
    body: { config: { site: 'loc-a' }, queues: { brand1: { 1: 5 } } },
    kv
  });
  assert.equal(r.status, 200);
  assert.ok(kv._keys().includes(`instances/${VALID_ID}/state`),
    `expected instances/${VALID_ID}/state, got ${kv._keys()}`);

  const raw = await kv.binding.get(`instances/${VALID_ID}/state`);
  const doc = JSON.parse(raw);
  assert.equal(doc.config.instanceId, VALID_ID,
    'the stored doc must be self-consistent with the key it lives under');
});

test('POST /api/save preserves the stored config on a queue-only payload', async () => {
  const kv = makeKv({
    [`instances/${VALID_ID}/state`]: JSON.stringify({
      config: { instanceId: VALID_ID, site: 'keep-me', brands: [{ key: 'brand1', models: [] }] },
      queues: {}
    })
  });
  await runFunction('functions/api/save.js', {
    url: `https://example.com/api/save?id=${VALID_ID}`,
    method: 'POST',
    body: { queues: { brand1: { 1: 3 } } },
    kv
  });
  const doc = JSON.parse(await kv.binding.get(`instances/${VALID_ID}/state`));
  assert.equal(doc.config.site, 'keep-me',
    'a queue-only save must not wipe the location label');
  assert.equal(doc.queues.brand1[1], 3);
});

test('POST /api/save answers OPTIONS for CORS preflight', async () => {
  const r = await runFunction('functions/api/save.js', {
    url: 'https://example.com/api/save', method: 'OPTIONS'
  });
  assert.equal(r.status, 204);
});

test('POST /api/save rejects a non-POST method', async () => {
  const r = await runFunction('functions/api/save.js', {
    url: 'https://example.com/api/save', method: 'GET'
  });
  assert.equal(r.status, 405);
});