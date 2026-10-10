'use strict';
// Cheap static tripwires over app/main.js.
//
// These are not behavioural tests - they cannot prove the app works. They
// exist so that a well-meant platform change cannot quietly alter Windows
// behaviour, which is the one thing this project cannot afford.
//
// Every assertion here corresponds to something that already bit us, or to a
// blocker found while planning the macOS port.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APP } = require('./helpers');

const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');

/** Line numbers mentioning `needle`, for readable failure messages. */
const linesWith = (needle) => main.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => l.includes(needle))
  .map(([n]) => n);

// --- Windows behaviour that must not silently change -------------------------

test('Windows still gets a null menu (adding a real menu would change the UI)', () => {
  // The macOS port needs Menu.setApplicationMenu() for Cmd+Q / Cmd+V. That must
  // be gated to darwin - doing it unconditionally would give Windows an app
  // menu bar it has never had.
  assert.ok(main.includes('setMenu(null)'),
    'main.js no longer calls setMenu(null); if this changed, Windows UI changed too');
  if (/Menu\.setApplicationMenu/.test(main)) {
    assert.ok(/darwin/.test(main),
      'a real application menu was added without a darwin guard - Windows would ' +
      'gain a menu bar it never had');
  }
});

test('Windows process-killing paths are preserved', () => {
  assert.ok(main.includes('taskkill'),
    'taskkill handling is gone; killPortHolders/cleanup on Windows would silently no-op');
  assert.ok(main.includes('netstat'),
    'netstat -ano port reclamation is gone; a stale port would block engine start');
});

test('Windows firewall automation is preserved', () => {
  assert.ok(main.includes('ensureFirewallRules'),
    'firewall setup was removed; first-run prompts on Windows would come back');
  assert.ok(/netsh/.test(main),
    'netsh rules are gone; LAN phone access would trigger a firewall prompt per launch');
});

// --- Launcher / updater hard requirements ------------------------------------

test('the NSIS uninstaller is located for installed Windows builds', () => {
  assert.ok(/UNINSTALLER_EXE/.test(main),
    'uninstaller discovery removed; the in-app uninstall button would break');
  assert.ok(main.includes('findUninstaller'));
});

test('the updater downloads the installer from the manifest', () => {
  assert.ok(main.includes('installUpdate'), 'the in-app update path is gone');
  assert.ok(/UPDATE_MANIFEST\s*=\s*'version\.json'/.test(main),
    'the updater must keep reading version.json from the site');
});

test('update checks repeat, not just once at launch', () => {
  // A build published while the app was already open went unnoticed until a
  // manual restart, which is why the pill appeared not to work.
  assert.ok(/setInterval\(\s*backgroundUpdateCheck/.test(main),
    'the periodic update re-check was removed; new versions would stay hidden ' +
    'until the user restarted by hand');
});

test('the periodic update timer is cleared on quit', () => {
  // An uncleared interval can hold the process open after quit.
  assert.ok(/clearInterval\(updatePollTimer\)/.test(main),
    'updatePollTimer is never cleared; it could keep the app alive after quit');
});

// --- Secrets that must never be embedded -------------------------------------

test('no private key or credential is embedded in main.js', () => {
  for (const re of [/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/, /FIREBASE_ADMIN/, /\.pem['"]/]) {
    assert.ok(!re.test(main),
      `main.js appears to embed a credential matching ${re}`);
  }
});

// --- Spawn error handling ----------------------------------------------------

test('child processes that can fail to launch have error handlers', () => {
  // spawn() emits an async 'error' event when the binary is missing. With no
  // listener that is an unhandled error event, which CRASHES the main process
  // rather than degrading. The cmd.exe helper used for in-app updates had this
  // bug and would take the app down on any non-Windows platform.
  const spawns = main.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /\bspawn\(/.test(l));
  assert.ok(spawns.length >= 4, `expected several spawn() calls, found ${spawns.length}`);

  // Every spawn must be followed within a few lines by an 'error' listener,
  // or assigned to a variable that later gets one.
  const srcLines = main.split('\n');
  const assigned = spawns
    .map(([n, l]) => {
      if (!/=\s*spawn\(/.test(l)) return [n, null];
      // "const helper = spawn(" -> "helper" (strip the declaration keyword).
      const name = l.split('=')[0].replace(/^\s*(?:const|let|var)\s+/, '').trim();
      return [n, name || null];
    })
    .filter(([, name]) => name);

  for (const [lineNo, name] of assigned) {
    // Look ahead to the end of this function, not a fixed number of lines:
    // handler attachment is legitimately spread across comments and several
    // sibling listeners.
    let end = lineNo;
    while (end < srcLines.length && end < lineNo + 60) {
      if (/^\s*function\s/.test(srcLines[end])) break;
      end++;
    }
    const window = srcLines.slice(lineNo - 1, end).join('\n');
    assert.ok(
      new RegExp(`${name}\\s*\\.on\\(\\s*['"]error['"]`).test(window),
      `spawn at line ${lineNo} ("${name}") has no .on('error') handler in the ` +
      'function that launches it. A failed launch raises an unhandled error ' +
      'event, which crashes the app instead of retrying.'
    );
  }
});

// --- Paths -------------------------------------------------------------------

test('no hard-coded drive paths outside a process.env fallback', () => {
  // Windows-only separators would break the macOS port. The two known
  // exceptions are `process.env.ProgramFiles || 'C:\\Program Files'` style
  // fallbacks inside the inherently-Windows-only uninstaller lookup: they are
  // OS-scoped by construction and resolve to a non-existent path elsewhere,
  // which that function already handles by returning null.
  const ALLOWED = /process\.env(\[['"][^\]]+['"]\]|\.\w+)?\s*\|\|/;
  const bad = main.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /['"][A-Za-z]:\\\\/.test(l) && !ALLOWED.test(l));
  assert.deepEqual(bad, [],
    `literal drive-letter paths outside an env fallback, at lines ` +
    `${bad.map(([n]) => n).join(', ')}`);
});

test('nodeIntegration stays off and contextIsolation stays on', () => {
  assert.match(main, /nodeIntegration:\s*false/,
    'nodeIntegration must remain false');
  assert.match(main, /contextIsolation:\s*true/,
    'contextIsolation must remain true');
});