'use strict';
// Guards what actually gets staged into the installer.
//
// app/assemble-server.ps1 (soon to be replaced by scripts/assemble-server.js)
// builds app/server/, which electron-builder copies verbatim into
// resources/server. That directory is the ONLY source of the installed app's
// engine, site, models and voices - and every build rewrites it from scratch.
//
// This is the gate for the macOS port, where that script becomes cross-platform
// code running on every Windows build too. If the staged tree changes
// unexpectedly, the app is broken for every customer.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, APP } = require('./helpers');

const STAGE = path.join(APP, 'server');

const stageExists = fs.existsSync(STAGE);

test('staged payload exists (run a build first if this fails)', (t) => {
  if (!stageExists) {
    t.skip('app/server not staged - run `npm run assemble:server` in app/');
    return;
  }
  assert.ok(fs.statSync(STAGE).isDirectory());
});

test('engine, config and the site are staged', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  for (const rel of ['video_server.js', 'shared/config.js', 'public/index.html']) {
    assert.ok(fs.existsSync(path.join(STAGE, rel)), `missing ${rel}`);
  }
});

test('the compiled TTS binary is staged', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  // macOS PyInstaller emits no extension, Windows emits .exe. The main process
  // resolves per platform; the payload must carry whichever was built.
  const candidates = ['tts_server.exe', 'tts_server'];
  const found = candidates.filter((f) => fs.existsSync(path.join(STAGE, f)));
  assert.ok(found.length > 0,
    `no TTS binary staged. Looked for: ${candidates.join(', ')}. ` +
    'Without it the app logs "TTS server missing" and every announcement is silent.');
});

test('speech models are staged', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  for (const f of ['kokoro-v1.0.int8.onnx', 'voices-v1.0.bin']) {
    const p = path.join(STAGE, f);
    assert.ok(fs.existsSync(p), `missing ${f} - the app would start but never speak`);
  }
});

test('the QR library ships with the site', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  // settings.html loads it from vendor/ at runtime; a missing file means the
  // mirror-link QR silently fails to render.
  assert.ok(fs.existsSync(path.join(STAGE, 'public', 'vendor', 'qrcode-generator.js')),
    'vendor/qrcode-generator.js is not staged');
});

test('build artefacts are NOT staged into the shipped app', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  // Shipping a .wrangler cache dir or the installer downloads inside the
  // package bloats every customer install.
  assert.ok(!fs.existsSync(path.join(STAGE, 'public', '.wrangler')),
    '.wrangler cache dir must not ship');
  assert.ok(!fs.existsSync(path.join(STAGE, 'public', 'downloads')),
    'the downloads folder must not ship inside the app');
});

test('no source secrets leak into the staged tree', (t) => {
  if (!stageExists) { t.skip('not staged'); return; }
  const banned = [/private\.pem/, /FIREBASE_ADMIN/, /BEGIN (RSA |EC )?PRIVATE KEY/];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  const files = walk(STAGE).filter((f) => /\.(js|json|html|pem|txt)$/.test(f));
  for (const f of files) {
    const body = fs.readFileSync(f, 'utf8');
    for (const re of banned) {
      assert.ok(!re.test(body), `${path.relative(ROOT, f)} looks like it contains ${re}`);
    }
  }
});

test('the test suite itself cannot reach the installer', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
  const files = pkg.build.files;
  assert.ok(!files.some((f) => f.includes('tests')),
    'tests/ is listed in build.files - the harness would ship to customers');
  const extras = pkg.build.extraResources.map((r) => r.from);
  assert.ok(!extras.includes('tests'),
    'tests/ is in extraResources - the harness would ship to customers');
});

test('the root tests directory is outside every packaging path', () => {
  // Belt and braces: tests/ lives at the repo root, which neither build.files
  // (asar whitelist) nor extraResources (server only) can reach.
  assert.ok(fs.existsSync(path.join(ROOT, 'tests')));
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.build.files.slice().sort(), ['!node_modules/**/*', 'icon.png', 'main.js', 'preload.js']);
});