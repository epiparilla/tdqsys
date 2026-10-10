'use strict';
// Settings regression tests.
//
// Both of these came from real reports:
//   1. Renaming the Location Label saved, then said "No configuration changes
//      detected." afConfigEqual deliberately ignores config.site (for cloud
//      sync the label is cosmetic), but the label IS editable on this page, so
//      the save compared nothing and refused.
//   2. The unlock CONFIRM box intermittently ignored typing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readPublic, extractFunction, assertInlineScriptsParse, loadAfJs } = require('./helpers');

const html = readPublic('settings.html');

// --- Syntax ------------------------------------------------------------------

test('settings.html inline scripts parse', () => {
  assertInlineScriptsParse(html, 'settings.html');
});

test('settings.html loads its local dependencies, not a CDN', () => {
  // Settings must keep working when the internet is down.
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of srcs) {
    assert.ok(!/^https?:/i.test(s), `settings.html loads "${s}" from a CDN; ` +
      'it must work offline');
  }
  assert.ok(srcs.includes('af.js'), 'settings.html no longer loads af.js');
  assert.ok(srcs.includes('vendor/qrcode-generator.js'),
    'settings.html no longer loads the QR generator');
});

// --- Location Label ----------------------------------------------------------

/** Rebuild the exact predicate onSave() uses. */
function changeOutcome(oldConfig, newConfig) {
  const af = loadAfJs();
  const labelChanged = String(oldConfig.site || '').trim() !== String(newConfig.site || '').trim();
  const structureChanged = !af.afConfigEqual(oldConfig, newConfig);
  if (!labelChanged && !structureChanged) return 'NO-CHANGE';
  const brandsChanged =
    JSON.stringify(oldConfig.brands || []) !== JSON.stringify(newConfig.brands || []);
  return brandsChanged ? 'ASK-KEEP-CLEAR' : 'SAVE-KEEP-NUMBERS';
}

const BASE = {
  schemaVersion: 2,
  instanceId: 'abc',
  site: 'old-label',
  hostname: 'tdqsys.local',
  cloudBase: 'https://tdqsys.pages.dev',
  ads: { enabled: true, minSec: 120, maxSec: 180 },
  brands: [{
    key: 'brand1', name: 'ATOYOT', color: '#EB0A1E',
    models: [{ label: 'Model 1', prefix: 'AA', pronounce: 'A' }]
  }]
};
const clone = (o) => JSON.parse(JSON.stringify(o));

test('afConfigEqual ignores the site label by design', () => {
  // Documented behaviour, not an accident: for cloud sync a label is cosmetic.
  // This is exactly why onSave() has to compare it separately.
  const af = loadAfJs();
  assert.equal(af.afConfigEqual(BASE, { ...clone(BASE), site: 'different' }), true,
    'afConfigEqual started comparing site; onSave relies on it NOT doing so');
});

test('changing only the Location Label is recognised as a change', () => {
  assert.equal(changeOutcome(clone(BASE), { ...clone(BASE), site: 'new-label' }),
    'SAVE-KEEP-NUMBERS',
    'renaming a location reported "No configuration changes detected"');
});

test('a label change does not ask about preserving queue numbers', () => {
  // The prompt is only meaningful when the brand/car layout moved.
  const af = loadAfJs();
  assert.equal(af.afConfigEqual(BASE, { ...clone(BASE), site: 'x' }), true);
});

test('whitespace-only label edits are not treated as a change', () => {
  assert.equal(changeOutcome(clone(BASE), { ...clone(BASE), site: '  old-label  ' }),
    'NO-CHANGE');
});

test('an emptied label is a change', () => {
  assert.equal(changeOutcome(clone(BASE), { ...clone(BASE), site: '' }),
    'SAVE-KEEP-NUMBERS');
});

test('an ad-interval change saves without the keep/clear prompt', () => {
  const next = clone(BASE);
  next.ads.minSec = 60;
  assert.equal(changeOutcome(clone(BASE), next), 'SAVE-KEEP-NUMBERS');
});

test('adding a car prompts about preserving numbers', () => {
  const next = clone(BASE);
  next.brands[0].models.push({ label: 'Model 2', prefix: 'BB', pronounce: 'B' });
  assert.equal(changeOutcome(clone(BASE), next), 'ASK-KEEP-CLEAR');
});

test('renaming a brand prompts about preserving numbers', () => {
  const next = clone(BASE);
  next.brands[0].name = 'TOYOTA';
  assert.equal(changeOutcome(clone(BASE), next), 'ASK-KEEP-CLEAR');
});

test('an identical save is correctly reported as no change', () => {
  assert.equal(changeOutcome(clone(BASE), clone(BASE)), 'NO-CHANGE');
});

// --- Unlock flow -------------------------------------------------------------

/** Build a sandbox for the unlock flow and run requestUnlock(). */
function unlockEnv({ focusWorks = true, missingTitle = false } = {}) {
  const timers = [];
  const input = {
    value: '',
    oninput: 'stale',
    onkeydown: 'stale',
    _sync: null,
    _key: null,
    _l: {},
    addEventListener(t, fn) { (this._l[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((x) => x !== fn); },
    fire(t, ev = {}) { (this._l[t] || []).forEach((f) => f.call(this, ev)); },
    focus() { if (focusWorks) ctx.document.activeElement = this; },
    get listeners() { return Object.values(this._l).reduce((n, a) => n + a.length, 0); }
  };
  const btn = { disabled: true, textContent: '' };
  const els = {
    'unlock-confirm-input': input,
    'unlock-final-btn': btn,
    'unlock-warn': { style: {} }
  };
  if (!missingTitle) {
    els['unlock-title'] = { textContent: '' };
    els['unlock-msg'] = { textContent: '' };
  }

  const ctx = {
    console,
    document: { activeElement: null, getElementById: (id) => els[id] || null },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }
  };
  ctx.window = ctx;
  ctx.ctx = ctx;
  ctx.__input = input;
  ctx.__btn = btn;
  ctx.__timers = timers;
  ctx.__modalOpened = false;

  vm.createContext(ctx);
  const code = `
    var unlocked = false;
    // requestUnlock() refuses to open while the licence does not allow changes.
    // These tests cover the unlock flow itself, so it starts out licensed.
    var licenceState = { canWrite: true };
    var alert = function () { ctx.__alerted = true; };
    function doUnlock() { unlocked = true; }
    function openModal() { ctx.__modalOpened = true; }
    ${extractFunction(html, 'requestUnlock')}
    ${extractFunction(html, 'focusUnlockInput')}
    ctx.__run = () => { requestUnlock(); };
    ctx.__drain = () => { while (ctx.__timers.length) ctx.__timers.shift()(); };
  `;
  vm.runInContext(code, ctx);
  return { ctx, input, btn, run: ctx.__run, drain: ctx.__drain };
}

test('unlock modal opens and focuses the confirm field', () => {
  const e = unlockEnv();
  e.run();
  assert.equal(e.ctx.__modalOpened, true);
  assert.equal(e.ctx.document.activeElement, e.input);
});

test('typing CONFIRM enables the unlock button', () => {
  const e = unlockEnv();
  e.run();
  e.input.value = 'CONFIRM';
  e.input.fire('input');
  assert.equal(e.btn.disabled, false);
});

test('other text leaves the unlock button disabled', () => {
  const e = unlockEnv();
  e.run();
  e.input.value = 'nope';
  e.input.fire('input');
  assert.equal(e.btn.disabled, true);
});

test('a cosmetic lookup failure still leaves a working confirm box', () => {
  // requestUnlock() used to assign oninput AFTER several text updates. A throw
  // there left the box on screen with no handler at all - visible, no caret,
  // typing swallowed. Exactly the reported symptom.
  const e = unlockEnv({ missingTitle: true });
  e.run();
  assert.equal(e.ctx.__modalOpened, true, 'modal must still open');
  assert.ok(e.input.listeners >= 1, 'handler must still be attached');
  e.input.value = 'CONFIRM';
  e.input.fire('input');
  assert.equal(e.btn.disabled, false, 'typing must still work');
});

test('focus is retried when the first attempt is a no-op', () => {
  // focus() on a not-yet-focusable element fails SILENTLY and looks exactly
  // like a disabled input.
  const e = unlockEnv({ focusWorks: false });
  e.run();
  assert.notEqual(e.ctx.document.activeElement, e.input,
    'precondition: focus should not have taken');
  e.input.focus = function () { e.ctx.document.activeElement = this; };
  e.drain();
  assert.equal(e.ctx.document.activeElement, e.input,
    'the retry loop must recover focus');
});

test('re-entering edit mode does not stack duplicate handlers', () => {
  const e = unlockEnv();
  e.run();
  const first = e.input.listeners;
  e.run();
  e.run();
  assert.equal(e.input.listeners, first,
    `handlers grew from ${first} to ${e.input.listeners} across re-entry`);
  e.input.value = 'CONFIRM';
  e.input.fire('input');
  assert.equal(e.btn.disabled, false);
});

test('stale oninput/onkeydown handlers are cleared', () => {
  const e = unlockEnv();
  e.run();
  assert.equal(e.input.oninput, null);
  assert.equal(e.input.onkeydown, null);
});

// --- Identity card ------------------------------------------------------------

test('the mirror link and instance id stay outside the locked form', () => {
  // They used to live inside it, so an operator in "locked" mode could not read
  // the mirror link they were supposed to share.
  const formEnd = html.indexOf('</form>');
  const mirror = html.indexOf('id="cfg-mirrorlink"');
  const instance = html.indexOf('id="cfg-instance"');
  assert.ok(mirror > -1 && instance > -1, 'identity fields are missing');
  assert.ok(mirror < formEnd, 'the mirror link moved inside the locked form');
  assert.ok(instance < formEnd, 'the instance id moved inside the locked form');
});

test('Settings links to itself are never removed by any filter', () => {
  // Settings is where software updates live; a hub that hides it strands the
  // user on an old build.
  assert.ok(/href="settings\.html"/.test(readPublic('index.html')),
    'the hub no longer offers a route to Settings');
});
// --- Licence card -----------------------------------------------------------

test('the licence card sits outside the locked settings form', () => {
  // An expired licence greys out the settings, but the operator must still be
  // able to reach renewal. Putting the card inside the form would trap them.
  const formStart = html.indexOf('<form id="settings-form"');
  const formEnd = html.indexOf('</form>');
  const card = html.indexOf('id="licence-card"');
  assert.ok(card > -1, 'the licence card is missing');
  assert.ok(card < formStart || card > formEnd, 'the licence card is inside the locked form');
});

test('the Updates card stays outside the locked settings form', () => {
  // An expired licence must never block the operator from fixing the problem,
  // and updates are how a booth gets un-stuck.
  const formStart = html.indexOf('<form id="settings-form"');
  const updates = html.indexOf('Software Updates');
  assert.ok(updates > -1, 'the Updates card is missing');
  assert.ok(updates < formStart, 'Updates moved inside the locked form');
});

test('Settings can reach the licence API and paste a code', () => {
for (const fn of ['fetchLicence', 'renderLicence', 'activateLicence']) {
    assert.ok(html.includes('function ' + fn + '('), fn + ' is missing');
  }
  assert.match(html, /api\/license/, 'Settings never talks to the licence API');
});

test('an expired licence keeps Edit Mode from opening', () => {
  // Otherwise the operator walks into a form they can fill in but cannot save,
  // with no explanation of why.
  assert.match(html, /function requestUnlock\(\)[\s\S]*?licenceState[\s\S]*?canWrite/,
    'requestUnlock does not consult the licence');
});
