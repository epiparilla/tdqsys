'use strict';
// Release gate - run before publishing an installer.
//
//   node tests/release-gate.js
//
// The normal suite must stay green while the product is still unlicensed, so
// the "has the owner pasted their public key yet?" check lives HERE instead of
// in a regular test. Failing it means every licence a client is given will be
// rejected by the app you are about to ship.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const license = require(path.join(ROOT, 'license.js'));

const problems = [];
const notes = [];

// 1. A trusted key must exist.
if (!Array.isArray(license.TRUSTED_PUBLIC_KEYS) || license.TRUSTED_PUBLIC_KEYS.length === 0) {
  problems.push(
    'TRUSTED_PUBLIC_KEYS is empty. Every licence would be rejected.\n' +
    '     Generate a keypair with:  node tools/license.js keygen\n' +
    '     then paste the printed public key into license.js before building.'
  );
}

// 2. Each entry must be well-formed and actually parseable.
const seen = new Set();
for (const entry of license.TRUSTED_PUBLIC_KEYS || []) {
  if (!entry || typeof entry.keyId !== 'string' || !entry.keyId.trim()) {
    problems.push('a trusted key entry has no keyId');
    continue;
  }
  if (seen.has(entry.keyId)) problems.push(`duplicate keyId "${entry.keyId}"`);
  seen.add(entry.keyId);
  if (typeof entry.pem !== 'string' || !entry.pem.includes('BEGIN PUBLIC KEY')) {
    problems.push(`key "${entry.keyId}" is not a PEM public key`);
    continue;
  }
  try {
    crypto.createPublicKey(entry.pem);
  } catch (e) {
    problems.push(`key "${entry.keyId}" does not parse: ${e.message}`);
  }
}

// 3. The private key must never be anywhere near the repo or the package.
//    Scanning for the PEM header is unambiguous; scanning for the *name*
//    "private.pem" is not, because prose and this file itself mention it.
const SELF = path.join(ROOT, 'tests', 'release-gate.js');
const PRIVATE_PEM = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const KEY_FILE_EXT = /\.(pem|key|p12|pfx)$/i;

const skipDirs = new Set(['node_modules', '.git', 'dist-installer', '.wrangler']);
function walk(dir, depth = 0) {
  if (depth > 6) return [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (skipDirs.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, depth + 1));
    else out.push(p);
  }
  return out;
}

for (const file of walk(ROOT)) {
  if (path.resolve(file) === SELF) continue;
  const rel = path.relative(ROOT, file);
  let body;
  try {
    if (fs.statSync(file).size > 4 * 1024 * 1024) continue;
    body = fs.readFileSync(file, 'utf8');
  } catch { continue; }

  if (PRIVATE_PEM.test(body)) {
    problems.push(`a PRIVATE KEY is present in ${rel} - the private half ` +
      'must stay offline and never be committed');
    continue;
  }
  // Any file with a key-ish extension has no business being in the repo.
  if (KEY_FILE_EXT.test(rel) && /PUBLIC KEY|BEGIN /.test(body)) {
    problems.push(`${rel} is a key file inside the repo - keep it offline`);
  }
}

// 4. The public web build must not contain the licence module at all.
const publicDir = path.join(ROOT, 'public');
if (fs.existsSync(publicDir)) {
  const leaked = fs.readdirSync(publicDir)
    .filter((f) => /licen[sc]e/i.test(f));
  if (leaked.length) {
    problems.push(`licence material is inside public/ (${leaked.join(', ')}) - ` +
      'it would be deployed to the website');
  }
}

// --- report ---------------------------------------------------------------

console.log('TDQSYS release gate\n' + '='.repeat(46));
console.log(`trusted keys : ${license.TRUSTED_PUBLIC_KEYS?.length || 0}` +
  (license.KEY_IDS?.length ? ` (${license.KEY_IDS.join(', ')})` : ''));
console.log(`product      : v${require(path.join(ROOT, 'app', 'package.json')).version}\n`);

for (const n of notes) console.log(`  note: ${n}`);

if (problems.length === 0) {
  console.log('PASS - safe to publish.\n');
  process.exit(0);
}

console.log('BLOCKED:\n');
for (const p of problems) console.log(`  x ${p}\n`);
process.exit(1);