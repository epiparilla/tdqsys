'use strict';
// Guards the hub.
//
// public/index.html is ONE file serving TWO audiences: video_server.js serves it
// for the local engine's "/" and main.js opens it in the desktop app, while
// Cloudflare Pages serves the same file as the public website.
//
// Trimming it for the website once gutted the local hub, which locked the user
// out of Settings and therefore out of software updates. This test runs the real
// filter from the page against real hosts, so that class of regression is caught
// before deploy rather than by a user.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readPublic } = require('./helpers');

const html = readPublic('index.html');

// The local-only links that must survive on the local box and be stripped on
// the website.
const LOCAL_ONLY = ['dashboard.html', 'display_with_ads.html'];
// The one link that must exist on both.
const SHARED = 'client.html';

test('hub contains the local links and the shared viewer link', () => {
  for (const href of LOCAL_ONLY) {
    assert.ok(html.includes(`href="${href}"`),
      `hub is missing "${href}". The local app needs it.`);
  }
  assert.ok(html.includes(SHARED), `hub is missing "${SHARED}"`);
});

test('local-only links are marked so the website filter can strip them', () => {
  // Count only real <a> tags - the string also appears inside the filter
  // script and its comments, which are not links.
  const marked = (html.match(/<a[^>]*data-hub="local"/g) || []).length;
  assert.equal(marked, LOCAL_ONLY.length,
    `expected ${LOCAL_ONLY.length} marked links, found ${marked}. ` +
    'Without the marker the website would show the whole local hub.');
});

test('hub always offers a route to Settings', () => {
  // Settings is where software updates live. A hub that hides it can strand
  // someone on an old build with no way forward - exactly what happened.
  assert.ok(/href="settings\.html"/.test(html),
    'hub has no Settings link; a user could be locked out of updates');
});

test('the update pill survives the local/website filter', () => {
  // The pill renders outside the filtered container, so it must not carry the
  // local-only marker or it would be stripped on the website.
  const pill = html.match(/id="update-pill"[\s\S]*?>/);
  assert.ok(pill, 'update pill markup is missing from the hub');
  assert.ok(!pill[0].includes('data-hub="local"'),
    'the update pill is marked local-only and would be hidden everywhere');
});

// --- The filter logic itself -------------------------------------------------

/** Build a sandbox whose document only contains the page's link elements. */
function makeSandbox(hostname, opts = {}) {
  const links = LOCAL_ONLY.map((href) => ({
    href, removed: false,
    parentNode: { removeChild(el) { el.removed = true; } }
  }));
  const sandbox = {
    console,
    window: { location: { hostname }, afDesktop: opts.afDesktop },
    localStorage: { getItem: (k) => (k === 'af_hostname' ? (opts.savedHost ?? null) : null) },
    document: {
      querySelectorAll: () => links.filter((l) => !l.removed)
    }
  };
  sandbox.window.window = sandbox.window;
  return { sandbox, links };
}

/** Extract and execute the inline hub script that strips local-only links. */
function runFilter(sandbox) {
  vm.createContext(sandbox);
  // Pick the inline block that actually does the stripping, rather than
  // pattern-matching its exact shape - it opens with a comment.
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const filter = blocks.find((b) => b.includes('data-hub="local"'));
  assert.ok(filter, 'could not find the hub link-filter script in index.html');
  vm.runInContext(filter, sandbox);
  return sandbox;
}

const CASES = [
  { name: 'cloud website', host: 'tdqsys.pages.dev', expectLocal: false },
  { name: 'cloud custom domain', host: 'queue.example.com', expectLocal: false },
  { name: 'localhost', host: 'localhost', expectLocal: true },
  { name: 'loopback IP', host: '127.0.0.1', expectLocal: true },
  { name: 'LAN hostname', host: 'tdqsys.local', expectLocal: true },
  { name: 'file:// or app protocol', host: '', expectLocal: true },
  { name: 'desktop app shell', host: 'some.corp.box', afDesktop: true, expectLocal: true },
  { name: 'saved af_hostname', host: 'shop-lan-1', savedHost: 'shop-lan-1', expectLocal: true }
];

for (const c of CASES) {
  test(`hub filter: ${c.name} -> local links ${c.expectLocal ? 'kept' : 'stripped'}`, () => {
    const { sandbox, links } = makeSandbox(c.host, { afDesktop: c.afDesktop, savedHost: c.savedHost });
    runFilter(sandbox);
    const survivors = links.filter((l) => !l.removed).map((l) => l.href);
    if (c.expectLocal) {
      assert.deepEqual(survivors.sort(), LOCAL_ONLY.slice().sort(),
        `${c.name || '(empty host)'} should keep every local link, kept: ${survivors}`);
    } else {
      assert.deepEqual(survivors, [],
        `${c.host} is not the local box, so no local-only link should remain, kept: ${survivors}`);
    }
  });
}

test('hub filter is idempotent across repeated evaluation', () => {
  const { sandbox, links } = makeSandbox('tdqsys.pages.dev');
  runFilter(sandbox);
  runFilter(sandbox);
  assert.deepEqual(links.filter((l) => !l.removed), [],
    'running the filter twice should not resurrect or error on removed nodes');
});