'use strict';
// Shared helpers for the tdqsys test suite.
//
// Zero dependencies on purpose: `node --test tests/` must work on a clean
// checkout with no `npm install`. Node 22 ships the runner, the assertions and
// the sandbox we need.
//
// These tests CANNOT ship in the installer. app/package.json whitelists
// exactly `main.js`, `preload.js`, `icon.png` into the asar, and
// extraResources copies only `app/server`. A root-level `tests/` directory is
// therefore physically unable to reach a user.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const APP = path.join(ROOT, 'app');
const FUNCTIONS = path.join(ROOT, 'functions');

// Ports deliberately offset from the live 8081/8001 so a test run can never
// collide with a running location or disturb it.
const TEST_PORT = Number(process.env.AF_TEST_PORT || 18081);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readPublic = (name) => fs.readFileSync(path.join(PUBLIC, name), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/**
 * Extract a top-level `function name(...) { ... }` block from source text.
 *
 * Keeps a preceding `async ` if there is one. Dropping it silently turns
 * `await` inside the body into a syntax error that looks like the page itself
 * is malformed.
 */
function extractFunction(src, name) {
  const needle = `function ${name}(`;
  const at = src.indexOf(needle);
  if (at < 0) throw new Error(`function ${name} not found`);

  let start = at;
  const before = src.slice(Math.max(0, at - 6), at);
  if (/async\s+$/.test(before)) start = at - 'async '.length;

  let i = src.indexOf('{', at);
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

/** Load af.js into a sandbox and hand back the context. */
function loadAfJs() {
  const sandbox = { console, setTimeout, clearTimeout, URLSearchParams, fetch };
  sandbox.window = sandbox;
  sandbox.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
  vm.createContext(sandbox);
  vm.runInContext(readPublic('af.js'), sandbox, { filename: 'af.js' });
  return sandbox;
}

/** Parse every inline <script> in a page - catches syntax errors before deploy. */
function assertInlineScriptsParse(html, label) {
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  for (let i = 0; i < blocks.length; i++) {
    new vm.Script(blocks[i][1], { filename: `${label}#inline${i}` });
  }
  return blocks.length;
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Poll until fn() is truthy or we time out. */
async function waitFor(fn, { timeout = 20000, interval = 150, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * Boot video_server.js against a throwaway data dir and port.
 * Never touches the real data.json, never binds the live port.
 */
async function startEngine() {
  const dataDir = tempDir('tdqsys-test-');
  const child = spawn(process.execPath, [path.join(ROOT, 'video_server.js')], {
    cwd: dataDir,
    env: {
      ...process.env,
      AF_DATA_DIR: dataDir,
      AF_PORT: String(TEST_PORT),
      AF_TTS_PORT: String(TEST_PORT + 1),
      AF_OWNER_SYNC: '1',          // never push to Cloudflare from a test
      AF_OFFLINE: '1'             // engine cloud base empty => no remote writes
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });

  const base = `http://127.0.0.1:${TEST_PORT}`;
  await waitFor(async () => {
    try { const r = await fetch(`${base}/api/config`); return r.ok; }
    catch { return false; }
  }, { what: `engine on :${TEST_PORT}`, timeout: 25000 }).catch((e) => {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    throw new Error(`${e.message}\n--- engine output ---\n${out}`);
  });

  return {
    base,
    dataDir,
    output: () => out,
    async stop() {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** The version the app is currently at, from app/package.json. */
function appVersion() {
  return JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
}

module.exports = {
  ROOT, PUBLIC, APP, FUNCTIONS, TEST_PORT,
  read, readPublic, exists,
  extractFunction, loadAfJs, assertInlineScriptsParse,
  tempDir, waitFor, startEngine, sha256, appVersion
};