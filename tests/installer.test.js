'use strict';
// Release-artifact guards.
//
// A mismatch between what version.json promises and what GitHub actually has
// is the failure that shipped once: the manifest claimed 1.1.10 while its URL
// still pointed at the 1.1.9 installer, so the app handed a user an OLDER
// binary than the one they were running. These checks compare what is built,
// what is published, and what the updater believes.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APP, appVersion } = require('./helpers');

const DIST = path.join(APP, 'dist-installer');
const VERSION = appVersion();

function ghAvailable() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('a locally built installer exists for the current version', (t) => {
  if (!fs.existsSync(DIST)) {
    t.skip('dist-installer not present - run a build first');
    return;
  }
  const setup = path.join(DIST, `TDQSYS Setup ${VERSION}.exe`);
  assert.ok(fs.existsSync(setup),
    `missing "${path.basename(setup)}". Dist holds: ` +
    fs.readdirSync(DIST).filter((f) => f.endsWith('.exe')).join(', '));
});

test('the portable build exists for the current version', (t) => {
  if (!fs.existsSync(DIST)) { t.skip('dist-installer not present'); return; }
  const portable = path.join(DIST, `TDQSYS ${VERSION} Portable.exe`);
  assert.ok(fs.existsSync(portable), `missing "${path.basename(portable)}"`);
});

test('the NSIS block map was produced alongside the installer', (t) => {
  if (!fs.existsSync(DIST)) { t.skip('dist-installer not present'); return; }
  assert.ok(fs.existsSync(path.join(DIST, `TDQSYS Setup ${VERSION}.exe.blockmap`)),
    'no blockmap - electron-builder did not finish the NSIS build');
});

test('no stale installers from older versions linger in dist', (t) => {
  // Not fatal on its own, but a stale file with a plausible name is exactly how
  // the wrong binary gets uploaded to a release.
  if (!fs.existsSync(DIST)) { t.skip('dist-installer not present'); return; }
  const exes = fs.readdirSync(DIST)
    .filter((f) => f.endsWith('.exe') && f.includes('TDQSYS'));
  const stale = exes.filter((f) => !f.includes(VERSION));
  t.diagnostic(`stale installers present: ${stale.join(', ') || 'none'}`);
});

test('the published GitHub release assets match the manifest', (t) => {
  if (!ghAvailable()) { t.skip('gh CLI not available'); return; }
  let release;
  try {
    const raw = execFileSync(
      'gh', ['api', `repos/epiparilla/tdqsys/releases/tags/v${VERSION}`],
      { encoding: 'utf8' }
    );
    release = JSON.parse(raw);
  } catch {
    t.skip(`no published release tagged v${VERSION} yet`);
    return;
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(APP, '..', 'public', 'version.json'), 'utf8')
  );
  const wantAsset = `tdqsys-setup-${VERSION}.exe`;
  const names = release.assets.map((a) => a.name);

  assert.ok(names.includes(wantAsset),
    `release v${VERSION} has no "${wantAsset}". Assets: ${names.join(', ')}. ` +
    'GitHub rewrites "TDQSYS Setup x.y.z.exe" into dots unless renamed.');
  assert.ok(names.includes(`tdqsys-portable-${VERSION}.exe`),
    `release v${VERSION} is missing its portable asset. Assets: ${names.join(', ')}`);

  for (const a of release.assets) {
    assert.equal(a.name, a.name.toLowerCase(),
      `asset "${a.name}" has uppercase characters`);
  }
  assert.equal(manifest.url.split('/').pop(), wantAsset,
    'version.json points at an asset name that is not in the release');
});