'use strict';
// afSaveState() must report whether the engine actually accepted a write.
//
// It used to swallow the response and always return true. Every caller assumed
// success: the dashboard ticked a number over, the localStorage event fired,
// the TV board updated - and nothing was persisted. With licensing in place a
// 403 is a normal outcome, so this silent path would mean an expired operator
// sees a queue that looks live and is not.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { PUBLIC, extractFunction } = require('./helpers');

const afSrc = () => fs.readFileSync(path.join(PUBLIC, 'af.js'), 'utf8');

/**
 * Run the real afSaveState with a scripted fetch and an optional
 * rejection-handler registration, exactly as af.js would in a browser.
 */
function harness({ isLocal = true, status = 200, json = { success: true }, throws = false } = {}) {
  const sandbox = {
    console: { error() {}, log() {}, warn() {} },
    URL, URLSearchParams, setTimeout,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => null, createElement: () => ({}) },
    fetch: throws
      ? async () => { throw new Error('ECONNREFUSED'); }
      : async () => ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => json
        }),
    window: { location: { hostname: isLocal ? 'localhost' : 'tdqsys.pages.dev' } }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  const src = afSrc();
  vm.runInContext(`
    ${extractFunction(src, 'afIsLocal')}
    ${extractFunction(src, 'afHostname')}
    ${extractFunction(src, 'afApiBase')}
    ${extractFunction(src, 'afOnSaveRejected')}
    ${extractFunction(src, 'afSaveState')}
    __register = afOnSaveRejected;
  `, sandbox);
  return {
    save: (state) => vm.runInContext('afSaveState', sandbox)(state),
    register: (fn) => vm.runInContext('__register', sandbox)(fn)
  };
}

test('a successful save returns true', async () => {
  const h = harness({ status: 200 });
  assert.equal(await h.save({ queues: {} }), true);
});

test('a 403 licence refusal returns false and notifies the page', async () => {
  let seen = null;
  const h = harness({ status: 403, json: { error: 'license_expired', notAfter: '2026-11-06' } });
  h.register((detail) => { seen = detail; });
  const ok = await h.save({ queues: {} });
  assert.equal(ok, false, 'a rejected save must not report success');
  assert.ok(seen, 'the page was never told the save was refused');
  assert.match(seen, /license_expired/);
  assert.match(seen, /2026-11-06/, 'the expiry date should reach the operator');
});

test('a 500 returns false rather than pretending to save', async () => {
  const h = harness({ status: 500, json: { error: 'boom' } });
  assert.equal(await h.save({ queues: {} }), false);
});

test('a network failure returns false', async () => {
  const h = harness({ throws: true });
  assert.equal(await h.save({ queues: {} }), false,
    'an unreachable engine must not look like a successful save');
});

test('a cloud page never writes and reports false', async () => {
  let called = false;
  const sandbox = {
    console: { error() {} }, URL, URLSearchParams, setTimeout,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { getElementById: () => null, createElement: () => ({}) },
    fetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
    window: { location: { hostname: 'tdqsys.pages.dev' } }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  const src = afSrc();
  vm.runInContext(`
    ${extractFunction(src, 'afIsLocal')}
    ${extractFunction(src, 'afHostname')}
    ${extractFunction(src, 'afApiBase')}
    ${extractFunction(src, 'afSaveState')}
  `, sandbox);
  const ok = await vm.runInContext('afSaveState', sandbox)({ queues: {} });
  assert.equal(ok, false);
  assert.equal(called, false, 'a cloud page must not POST to the engine');
});

test('the dashboard registers a rejection handler and shows a banner', () => {
  const dash = fs.readFileSync(path.join(PUBLIC, 'dashboard.html'), 'utf8');
  assert.ok(/id="save-rejected"/.test(dash),
    'the dashboard has no banner element to show a refused save');
  assert.ok(/afOnSaveRejected\(/.test(dash),
    'the dashboard does not listen for save rejections');
  // It must actually consult the return value, not just call and forget.
  assert.ok(/=\s*await\s+afSaveState\(/.test(dash),
    'the dashboard ignores the afSaveState() result');
});

test('a broken rejection handler cannot break the save path', async () => {
  const h = harness({ status: 403, json: { error: 'license_expired' } });
  h.register(() => { throw new Error('handler blew up'); });
  const ok = await h.save({ queues: {} });
  assert.equal(ok, false, 'the result must still be correct when the handler throws');
});