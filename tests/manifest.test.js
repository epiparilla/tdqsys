'use strict';
// Guards the software-update manifest.
//
// This test exists because version.json once claimed 1.1.10 while its `url`
// still pointed at the 1.1.9 installer - the app would have handed a user an
// OLDER binary than the one they were running. It shipped. The size mismatch is
// what the in-app updater verifies, so a wrong size is a silent failure too.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PUBLIC, read, readPublic, appVersion } = require('./helpers');

const manifest = JSON.parse(readPublic('version.json'));
const pkgVersion = appVersion();

test('manifest.version matches app/package.json version', () => {
  assert.equal(
    manifest.version, pkgVersion,
    `version.json says ${manifest.version} but app/package.json says ${pkgVersion}. ` +
    'The app compares these and will offer an update to its own version.'
  );
});

test('manifest.url is a well-formed https download URL', () => {
  assert.match(manifest.url, /^https:\/\/[\w.-]+\/[\w./-]+$/);
  assert.ok(manifest.url.includes(manifest.version),
    `url "${manifest.url}" does not mention version ${manifest.version}`);
});

test('release asset name is lowercase (GitHub sanitises spaces to dots)', () => {
  const asset = manifest.url.split('/').pop();
  assert.equal(asset, asset.toLowerCase(),
    `asset "${asset}" has uppercase. GitHub rewrites "TDQSYS Setup 1.1.9.exe" to ` +
    'dots, which silently breaks the URL in version.json.');
  assert.ok(asset.startsWith('tdqsys-'), `asset should use the tdqsys- prefix, got "${asset}"`);
});

test('manifest.size matches installerBytes and is a plausible byte count', () => {
  assert.equal(manifest.size, manifest.installerBytes);
  assert.ok(Number.isInteger(manifest.size));
  // A TDQSYS installer is ~200 MB. Anything under 50 MB means the size was
  // not measured from the real artifact.
  assert.ok(manifest.size > 50 * 1024 * 1024,
    `installerBytes ${manifest.size} is implausibly small - was it measured?`);
});

test('the installer URL actually resolves', async (t) => {
  // Network test. Skipped rather than failed if the box is offline, because a
  // flaky network is not a regression in this repo.
  let head;
  try {
    head = await fetch(manifest.url, { method: 'HEAD', redirect: 'follow' });
  } catch (e) {
    t.skip(`network unavailable: ${e.message}`);
    return;
  }
  assert.ok(head.ok, `${manifest.url} returned HTTP ${head.status}`);
});

test('hub links the viewer with an explicit instance id', () => {
  const html = readPublic('index.html');
  const links = [...html.matchAll(/<a\s+href="([^"]+)"/g)].map((m) => m[1]);
  const viewerLinks = links.filter((h) => h.includes('client.html'));
  assert.ok(viewerLinks.length > 0, 'hub has no link to the mobile viewer');
  for (const href of viewerLinks) {
    assert.ok(href.includes('client.html?id='),
      `viewer link "${href}" has no ?id=. Without it the viewer has no instance to ` +
      'read and refuses to guess a location.');
    const id = new URLSearchParams(href.split('?')[1]).get('id');
    assert.match(id, /^[0-9a-f-]{36}$/, `viewer link "${href}" has a malformed instance id`);
  }
});

test('display.html is the retired stub, not the TV board', () => {
  const file = path.join(PUBLIC, 'display.html');
  if (!fs.existsSync(file)) return; // fully removed is also acceptable
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('TV DISPLAY RETIRED'),
    'display.html exists but is not the retired stub');
  assert.ok(!html.includes('start-overlay'),
    'display.html still contains the TV board overlay');
  assert.ok(!html.includes('requestFullscreen'),
    'display.html still contains fullscreen handling');
});

test('the /display stub does not silently pick a location', () => {
  const file = path.join(PUBLIC, 'display.html');
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');
  // It used to forward to client.html?id=<hardcoded uuid>, so the route showed
  // one specific location's queue to anyone who opened it - including on
  // phones. With no inbound ?id= it must land on "No location selected".
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(html),
    'display.html hard-codes an instance id; it must forward without one');
  assert.ok(html.includes("'client.html' + (id ?"),
    'display.html should forward the inbound id only when one was supplied');
});

test('version.json is valid JSON with the fields the updater needs', () => {
  for (const key of ['version', 'url', 'size']) {
    assert.ok(manifest[key] !== undefined, `version.json missing "${key}"`);
  }
  assert.ok(typeof manifest.notes === 'string' && manifest.notes.length > 0,
    'version.json should carry release notes for the update prompt');
});