'use strict';
// The dashboard must stop LOOKING live when a licence lapses.
//
// The earlier behaviour let the operator tap +, watch the number change on
// screen, and only discover a moment later that the save had been refused and
// the value snapped back. That reads as a software fault, and it is exactly
// what an operator does at the end of an event. The controls are now genuinely
// disabled, with the reason stated, while the board keeps showing live values.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { PUBLIC, extractFunction } = require('./helpers');

const html = fs.readFileSync(path.join(PUBLIC, 'dashboard.html'), 'utf8');

/** Minimal DOM: just enough to see what applyLicenceLock touches. */
function sandbox() {
  const made = [];
  const make = (tag) => ({
    tagName: tag.toUpperCase(),
    disabled: false,
    style: {},
    onclick: null,
    onchange: null,
    _attrs: {},
    getAttribute() { return null; },
    setAttribute() {},
    addEventListener() {},
    appendChild(c) { made.push(c); return c; },
    set textContent(v) { this._text = v; },
    get textContent() { return this._text || ''; },
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html || ''; },
    dataset: {},
    style: {},
    set cssText(v) { this._css = v; },
    classList: { add() {}, remove() {}, contains: () => false }
  });

  const controls = [
    make('button'), make('input'), make('button'), make('input'),
    make('button')   // the re-announce button
  ];
  const els = {
    'licence-locked': make('div'),
    'licence-locked-why': make('span'),
    'save-rejected': make('p'),
    'save-rejected-why': make('span'),
    'settings-link': make('a')
  };

  const ctx = {
    console,
    document: {
      getElementById: (id) => els[id] || null,
      // Only the queue controls are matched; the header links must not be.
      querySelectorAll: (sel) => (sel.includes('brand-sections') ? controls : [])
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout,
    fetch: async () => ({ ok: false }),
    setInterval() {},
    afIsLocal: () => true,
    afApiBase: () => 'http://localhost:8081',
    afFetchState: async () => null,
    afSaveState: async () => true
  };
  ctx.window = ctx;
  ctx.ctx = ctx;   // so the in-context code can hand results back out
  vm.createContext(ctx);

  vm.runInContext(`
    let licenceCanWrite = true;
    let licenceStatus = null;
    function refuseIfLocked() { if (licenceCanWrite) return false; return true; }
    ${extractFunction(html, 'applyLicenceLock')}
    ctx.__lock = applyLicenceLock;
    ctx.__editable = () => licenceCanWrite;
    ctx.__refuse = refuseIfLocked;
  `, ctx);

  return { ctx, controls, els };
}

const EXPIRED = {
  state: 'expired', canWrite: false, until: '2020-01-06',
  detail: 'Licence ended on 2020-01-06.'
};
const VALID = { state: 'valid', canWrite: true, until: '2026-12-31' };

describe('dashboard licence lock', () => {
  test('an expired licence disables every queue control', () => {
    const { ctx, controls } = sandbox();
    ctx.__lock(EXPIRED);
    assert.ok(controls.every((c) => c.disabled === true),
      'a +/- button or number input stayed enabled');
  });

  test('a valid licence leaves them enabled', () => {
    const { ctx, controls } = sandbox();
    ctx.__lock(VALID);
    assert.ok(controls.every((c) => c.disabled === false));
  });

  test('the lock is scoped to the controls, not the header links', () => {
    // Opening the display screen and reaching Settings must survive expiry -
    // Settings is where renewal happens.
    const { ctx } = sandbox();
    ctx.__lock(EXPIRED);
    assert.ok(/brand-sections/.test(html.match(/querySelectorAll\('([^']+)'/)[1]),
      'the selector must target the queue controls only');
    assert.ok(!html.match(/querySelectorAll\('[^']*link-button/),
      'the header links must not be swept up by the lock');
  });

  test('it says why, and says the board still works', () => {
    const { ctx, els } = sandbox();
    ctx.__lock(EXPIRED);
    assert.equal(els['licence-locked'].style.display, 'block');
    assert.match(els['licence-locked-why'].textContent, /expired on 2020-01-06/);
    assert.match(html, /still being served|live values/i,
      'the operator should be told the booth still works');
  });

  test('an unlicensed machine gets a different explanation', () => {
    const { ctx, els } = sandbox();
    ctx.__lock({ state: 'no_licence', canWrite: false });
    assert.match(els['licence-locked-why'].textContent, /not licensed/);
  });

  test('re-licensing re-enables the controls', () => {
    const { ctx, controls, els } = sandbox();
    ctx.__lock(EXPIRED);
    ctx.__lock(VALID);
    assert.ok(controls.every((c) => c.disabled === false), 'controls stayed disabled after a renewal');
    assert.equal(els['licence-locked'].style.display, 'none');
  });

  test('the handlers refuse a tap instead of changing the number anyway', () => {
    // Belt and braces: even if a disabled element somehow fires its onclick,
    // the change must not be applied optimistically and then reverted.
    const { ctx } = sandbox();
    ctx.__lock(EXPIRED);
    assert.equal(ctx.__refuse(), true);
    ctx.__lock(VALID);
    assert.equal(ctx.__refuse(), false);
    for (const fn of ['updateQueue', 'setQueue', 'reannounce', 'commitChange']) {
      assert.ok(new RegExp(`function ${fn}\\([\\s\\S]{0,320}?refuseIfLocked\\(\\)`).test(html),
        `${fn} does not check the lock first`);
    }
  });

  test('the lock survives the board being rebuilt', () => {
    // buildDashboard() replaces every control element, so a lock applied only
    // at boot would be lost the first time the board re-rendered.
    assert.match(html, /buildDashboard\(dataStore\)[\s\S]{0,600}?applyLicenceLock/,
      'the lock is not re-applied after a rebuild');
  });

  test('the lock is re-checked while the app is open', () => {
    assert.match(html, /setInterval\(refreshLicence/,
      'a licence can lapse mid-shift and nothing re-checks it');
  });

  test('licence state is fetched before the board is first drawn', () => {
    assert.match(html, /refreshLicence\(\)\.then\(\(\) => fetchInitialData\(\)\)/,
      'the board renders tappable controls before the licence is known');
  });
});