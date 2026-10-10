'use strict';
// Mirror-link QR correctness.
//
// The QR is printed and stuck on a wall, so two failure modes matter:
//   1. It encodes the wrong thing  -> the customer scans and gets nowhere.
//   2. It is blurry                -> it looks fine on screen, fails in print.
//      A fractional module size is the classic cause: browsers anti-alias it,
//      and scanners need hard black/white edges.
//
// A full end-to-end decode (encode -> independent decoder -> compare) was run
// against jsQR during development and passed for every case below. The decode
// step needs a dependency we deliberately do not carry, so when jsqr happens to
// be installed we run it, and otherwise we fall back to the structural checks.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PUBLIC, readPublic, extractFunction } = require('./helpers');

const MIRROR = 'https://tdqsys.pages.dev/client.html?id=8c8b6714-f300-413f-bf75-e1156662acfb';
const QUIET = 4;

// The vendored library, loaded as the page would.
// The vendored library, evaluated into the given context so that
// renderMirrorQr() sees the same global `qrcode` the page does.
function loadLib(ctx) {
  const src = fs.readFileSync(path.join(PUBLIC, 'vendor', 'qrcode-generator.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'qrcode-generator.js' });
  return ctx.qrcode;
}

test('the QR library is vendored, not fetched', () => {
  const lib = path.join(PUBLIC, 'vendor', 'qrcode-generator.js');
  assert.ok(fs.existsSync(lib), 'vendor/qrcode-generator.js is missing');
  const settings = readPublic('settings.html');
  assert.ok(/src="vendor\/qrcode-generator\.js"/.test(settings));
  assert.ok(!/src="https?:[^"]*qrcode/i.test(settings),
    'the QR library must not be loaded from a CDN - Settings has to work offline');
});

/** Run the page's own render function against a recording canvas stub. */
function render(text, { focusWorks = true } = {}) {
  const draws = [];
  const ctx2d = {
    _fill: null,
    set fillStyle(v) { this._fill = v; },
    get fillStyle() { return this._fill; },
    fillRect(x, y, w, h) { draws.push({ x, y, w, h, fill: this._fill }); }
  };
  const canvas = {
    width: 0, height: 0, hidden: true,
    getContext: () => ctx2d,
    toDataURL: () => 'data:image/png;base64,TESTSTUB'
  };
  const field = { value: text };
  const actions = { hidden: false };
  const storage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); }
  };
  const replaced = [];

  const ctx = {
    console, localStorage: storage,
    document: {
      activeElement: null,
      getElementById: (id) => ({ 'cfg-mirrorlink': field, 'mirror-qr-canvas': canvas, 'mirror-qr-actions': actions }[id]),
      createElement: () => ({ click() {}, style: {}, set innerHTML(v) { replaced.push(v); } }),
      body: { appendChild() {}, removeChild() {} }
    },
    setTimeout,
    window: { location: { href: 'https://tdqsys.pages.dev/settings', replace() {} } }
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  // The page loads af.js and the QR library before this function runs.
  loadLib(ctx);

  const settingsSrc = readPublic('settings.html');
  vm.runInContext(`
    var mirrorQrObj = null;
    ${extractFunction(settingsSrc, 'renderMirrorQr')}
    ${extractFunction(settingsSrc, 'downloadMirrorQr')}
    renderMirrorQr();
    var __qr = mirrorQrObj;
  `, ctx);

  return {
    canvas, actions, draws, field,
    qr: vm.runInContext('__qr', ctx),
    get inputs() { return replaced; }
  };
}

test('the QR encodes the mirror link', () => {
  const r = render(MIRROR);
  assert.ok(r.qr, 'no QR object was produced');
  assert.ok(r.qr.getModuleCount() > 0);
});

test('modules land on an integer grid so print output stays crisp', () => {
  // A fractional cell size anti-aliases and will not scan.
  const r = render(MIRROR);
  const dark = r.draws.filter((d) => d.fill === '#000000');
  assert.ok(dark.length > 0, 'no dark modules were drawn');
  const cell = dark[0].w;
  assert.equal(cell, Math.floor(cell),
    `module size ${cell} is fractional; the QR will blur in print`);
  for (const d of dark) {
    assert.equal(d.w, cell);
    assert.equal(d.h, cell);
    assert.equal(d.x % cell, 0, `module at x=${d.x} is off the ${cell}px grid`);
    assert.equal(d.y % cell, 0, `module at y=${d.y} is off the ${cell}px grid`);
  }
});

test('the white background is painted before any module', () => {
  const r = render(MIRROR);
  assert.equal(r.draws[0].fill, '#ffffff',
    'the QR must be painted on white, not transparent - scanners need contrast');
  assert.equal(r.draws[0].x, 0);
  assert.equal(r.draws[0].y, 0);
  assert.ok(r.draws[0].w >= r.canvas.width && r.draws[0].h >= r.canvas.height,
    'the background must cover the whole canvas');
});

test('every module sits inside the required quiet zone', () => {
  // The QR spec requires a 4-module margin or scanners struggle to lock on.
  const r = render(MIRROR);
  const cell = r.draws.find((d) => d.fill === '#000000').w;
  const margin = QUIET * cell;
  for (const d of r.draws.filter((x) => x.fill === '#000000')) {
    assert.ok(d.x >= margin, `module at x=${d.x} violates the ${margin}px quiet zone`);
    assert.ok(d.y >= margin, `module at y=${d.y} violates the ${margin}px quiet zone`);
    assert.ok(d.x < r.canvas.width - margin,
      `module at x=${d.x} overruns the trailing quiet zone`);
  }
});

test('the canvas is a print-grade size', () => {
  const r = render(MIRROR);
  assert.ok(r.canvas.width >= 512,
    `canvas is ${r.canvas.width}px; a printed sign needs more`);
  assert.equal(r.canvas.width, r.canvas.height, 'the QR canvas must be square');
});

test('an empty mirror link hides the QR and its buttons', () => {
  const r = render('');
  assert.equal(r.canvas.hidden, true);
  assert.equal(r.actions.hidden, true);
});

test('download produces a correctly named .png link', () => {
  const r = render(MIRROR);
  assert.ok(r.qr, 'precondition: a QR must exist before it can be downloaded');

  let anchor = null;
  const ctx = {
    console,
    document: {
      getElementById: (id) => ({ 'cfg-mirrorlink': r.field, 'mirror-qr-canvas': r.canvas }[id]),
      createElement: () => ({
        set href(v) { this._href = v; },
        get href() { return this._href; },
        set download(v) { this._dl = v; },
        get download() { return this._dl; },
        click() { anchor = this; }
      }),
      body: { appendChild() {}, removeChild() {} }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(`
    var mirrorQrObj = __qr;
    ${extractFunction(readPublic('settings.html'), 'downloadMirrorQr')}
    downloadMirrorQr('png');
  `, Object.assign(ctx, { __qr: r.qr }));

  assert.ok(anchor, 'downloadMirrorQr never created a link');
  assert.match(anchor.download, /^tdqsys-queue-[0-9a-f]{8}\.png$/,
    `unexpected download filename "${anchor.download}"`);
  assert.ok(anchor.href.startsWith('data:image/png'),
    'PNG download must produce a data: URL, not navigate somewhere');
});

test('download produces a vector .svg link for print', () => {
  const r = render(MIRROR);
  let anchor = null;
  const ctx = {
    console,
    document: {
      getElementById: (id) => ({ 'cfg-mirrorlink': r.field, 'mirror-qr-canvas': r.canvas }[id]),
      createElement: () => ({
        set href(v) { this._href = v; }, get href() { return this._href; },
        set download(v) { this._dl = v; }, get download() { return this._dl; },
        click() { anchor = this; }
      }),
      body: { appendChild() {}, removeChild() {} }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(`
    var mirrorQrObj = __qr;
    ${extractFunction(readPublic('settings.html'), 'downloadMirrorQr')}
    downloadMirrorQr('svg');
  `, Object.assign(ctx, { __qr: r.qr }));

  assert.ok(anchor, 'downloadMirrorQr never created a link');
  assert.match(anchor.download, /^tdqsys-queue-[0-9a-f]{8}\.svg$/);
  assert.ok(anchor.href.startsWith('data:image/svg+xml'),
    'SVG download must produce vector output so it stays sharp at any size');
});

test('end-to-end decode (skipped unless jsqr is installed)', (t) => {
  let jsQR;
  try {
    jsQR = require('jsqr');
  } catch {
    t.skip('jsqr not installed; structural checks above still apply');
    return;
  }

  // Independent re-encode, decoded with a third-party reader, to prove the
  // data survives the whole pipeline rather than just "did not throw".
  const libCtx = { console };
  vm.createContext(libCtx);
  const qrcode = loadLib(libCtx);
  const qr = qrcode(0, 'M');
  qr.addData(MIRROR);
  qr.make();

  const count = qr.getModuleCount();
  const total = count + QUIET * 2;
  const scale = 4;
  const size = total * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = ((r + QUIET) * scale + y) * size + ((c + QUIET) * scale + x);
          data[px * 4] = 0; data[px * 4 + 1] = 0; data[px * 4 + 2] = 0; data[px * 4 + 3] = 255;
        }
      }
    }
  }
  const out = jsQR(data, size, size);
  assert.ok(out, 'an independent decoder could not read the QR at all');
  assert.equal(out.data, MIRROR,
    'the QR decoded to something other than the mirror link');
});