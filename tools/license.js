#!/usr/bin/env node
'use strict';
// TDQSYS licence issuance.
//
//   node tools/license.js keygen
//   node tools/license.js request
//   node tools/license.js issue --request <file|code> --from 11-01 --until 11-06
//   node tools/license.js issue --instance <uuid> --customer "Acme" --from 2026-11-01 --until 2026-11-06
//   node tools/license.js verify <code>
//
// THIS IS THE OWNER'S TOOL. It is deliberately kept out of the installed app
// (app/package.json whitelists what goes into the asar) and out of the public
// site. It is the only thing that ever touches the private key.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const license = require(path.join(ROOT, 'license.js'));

const KEY_DIR = path.join(os.homedir(), '.tdqsys');
const PRIVATE_PATH = path.join(KEY_DIR, 'private.pem');

// ---------------------------------------------------------------------------
// Argument parsing (no dependencies)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

/**
 * Accepts 11-01, 11/01, 1 Nov, 2026-11-01. A missing year is assumed to be the
 * current one, which is what you want when a client says "the first to the
 * sixth" without repeating themselves.
 */
function normaliseDate(input, fallbackYear = new Date().getFullYear()) {
  if (!input) return null;
  const s = String(input).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // "11-01" is month-day, matching the help text and how these read aloud.
  m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${fallbackYear}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;

  // "1 Nov", "1-Nov", "1 November 2026", "Nov 1", "Nov 1 2026".
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIndex = (name) => months.indexOf(String(name).slice(0, 3).toLowerCase());

  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})(?:[-\s](\d{4}))?$/);
  if (m && monthIndex(m[2]) > -1) {
    return `${m[3] || fallbackYear}-${String(monthIndex(m[2]) + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }

  m = s.match(/^([A-Za-z]{3,9})[-\s](\d{1,2})(?:[-\s](\d{4}))?$/);
  if (m && monthIndex(m[1]) > -1) {
    return `${m[3] || fallbackYear}-${String(monthIndex(m[1]) + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  throw new Error(`cannot understand the date "${input}". Try 2026-11-01, 11-01 or "1 Nov".`);
}

const nonce = () => crypto.randomBytes(6).toString('hex');

// ---------------------------------------------------------------------------
// keygen
// ---------------------------------------------------------------------------

function cmdKeygen(args) {
  if (fs.existsSync(PRIVATE_PATH)) {
    console.error(`\n  A private key already exists at:\n    ${PRIVATE_PATH}\n`);
    console.error('  Replacing it would strand every licence you have already issued -');
    console.error('  the apps in the field carry the matching PUBLIC key and nothing');
    console.error('  can make them accept a signature from a new key without a rebuild.');
    if (args.force !== true) {
      console.error('\n  Refusing. Pass --force only if you are certain nothing is deployed.\n');
      process.exitCode = 1;
      return;
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEY_DIR, { recursive: true });

  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  fs.writeFileSync(PRIVATE_PATH, privPem, { mode: 0o600 });
  try { fs.chmodSync(PRIVATE_PATH, 0o600); } catch (e) { /* Windows ignores POSIX modes */ }

  console.log('\n  TDQSYS licence key generated.\n');
  console.log('  PRIVATE KEY');
  console.log(`    ${PRIVATE_PATH}\n`);
  console.log('  The PEM printed at the bottom of this screen is the PUBLIC key. It');
  console.log('  goes in the app. Printing it is NOT a backup - anyone holding it can');
  console.log('  read your licences, but nobody holding it can issue new ones.');
  console.log('\n  What you must back up is the PRIVATE KEY FILE above. Open it, print');
  console.log('  it, and store two copies in two separate physical places, plus one');
  console.log('  printed copy with your paperwork.');
  console.log('\n  If you lose it you can never license anyone again: every app already');
  console.log('  shipped carries only the public half, and nothing can make them');
  console.log('  accept a new key without a rebuild and a reinstall at each site.\n');
  console.log('  Paste this PUBLIC key into license.js, replacing the empty');
  console.log('  TRUSTED_PUBLIC_KEYS array:\n');
  console.log(pubPem.split('\n').filter(Boolean).map((l) => `    ${l}`).join('\n'));
  console.log('\n  Use the whole PEM above as the `pem` value of a TRUSTED_PUBLIC_KEYS');
  console.log(`  entry, for example { keyId: '${args['key-id'] || args.keyId || 'k1'}', pem: "<PEM above>" }`);
  console.log('\n  Then run:  node tests\\release-gate.js\n');
}

// ---------------------------------------------------------------------------
// request  (produced by the client app; we only read it)
// ---------------------------------------------------------------------------

function cmdRequest(args) {
  const file = args.file || args.request;
  if (!file) { console.error('  Usage: license.js request --file <request.json>'); process.exitCode = 1; return; }
  const doc = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  console.log('\n  CLIENT REQUEST\n' + '  ' + '-'.repeat(46));
  console.log(`  instance : ${doc.instanceId}`);
  console.log(`  label    : ${doc.site || '(none)'}`);
  console.log(`  wants    : ${doc.from || '?'} -> ${doc.until || '?'}`);
  console.log(`  note     : ${doc.note || '(none)'}`);
  console.log('\n  Issue against the instance above, e.g.\n');
  console.log(`    node tools/license.js issue --request "${file}"`);
  console.log('         --from 11-01 --until 11-06 --customer "Acme Auto Wash"\n');
}

// ---------------------------------------------------------------------------
// issue
// ---------------------------------------------------------------------------

function loadPrivate() {
  if (!fs.existsSync(PRIVATE_PATH)) {
    console.error(`\n  No private key at ${PRIVATE_PATH}`);
    console.error('  Run:  node tools/license.js keygen\n');
    process.exitCode = 1;
    return null;
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_PATH, 'utf8'));
}

function cmdIssue(args) {
  const privateKey = loadPrivate();
  if (!privateKey) return;

  let instanceId = args.instance;
  let customer = args.customer;
  let site = args.site;

  if (args.request) {
    const doc = JSON.parse(fs.readFileSync(path.resolve(args.request), 'utf8'));
    instanceId = instanceId || doc.instanceId;
    customer = customer || doc.customer || doc.site;
    site = site || doc.site;
  }

  if (!instanceId) {
    console.error('\n  Need an instance id. Pass --instance <uuid> or --request <file>.\n');
    process.exitCode = 1;
    return;
  }
  if (!/^[0-9a-fA-F-]{1,64}$/.test(String(instanceId))) {
    console.error(`\n  "${instanceId}" is not a valid instance id.\n`);
    process.exitCode = 1;
    return;
  }

  const from = normaliseDate(args.from);
  const until = normaliseDate(args.until);
  if (!from || !until) {
    console.error('\n  Need --from and --until (e.g. --from 11-01 --until 11-06).\n');
    process.exitCode = 1;
    return;
  }
  if (until < from) {
    console.error(`\n  --until (${until}) is before --from (${from}).\n`);
    process.exitCode = 1;
    return;
  }

  const days = Math.round(
    (new Date(`${until}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1;
  // parseArgs keys off the raw flag name, so --key-id arrives as 'key-id'.
  // Accept the camelCase form too so neither spelling silently falls back to
  // the default and mislabels a rotated-key licence.
  const keyId = args['key-id'] || args.keyId || 'k1';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(keyId))) {
    console.error(`\n  "${keyId}" is not a usable key id (letters, digits, - and _ only).\n`);
    process.exitCode = 1;
    return;
  }
  // Term licences are meant to cover an event. Anything longer than a working
  // season is almost always a typo, so it has to be confirmed deliberately.
  const maxDays = Number(args['max-days'] || 180);
  if (days > maxDays) {
    console.error(`\n  That is a ${days}-day licence. Term licences are usually much`);
    console.error('  shorter - the app is meant to run for an event, then need a');
    console.error(`  renewal. Pass --max-days <n> (currently ${maxDays}) to override`);
    console.error('  if this is deliberate.\n');
    process.exitCode = 1;
    return;
  }

  const payload = {
    v: license.PAYLOAD_VERSION,
    i: String(instanceId).toLowerCase(),
    c: customer || site || 'Licensed location',
    b: from,
    x: until,
    n: nonce(),
    k: keyId
  };

  // Build the code through the core so the tool can never drift from the
  // verifier. buildCode is the only thing that knows the wire format.
  const code = license.buildCode(payload, (bytes) => crypto.sign(null, bytes, privateKey));

  console.log('\n  ABOUT TO ISSUE\n' + '  ' + '-'.repeat(46));
  console.log(`  instance : ${payload.i}`);
  console.log(`  customer : ${payload.c}`);
  console.log(`  valid    : 12:00am ${payload.b}  ->  11:59pm ${payload.x}  (${days} day${days > 1 ? 's' : ''})`);
  console.log(`  key id   : ${payload.k}`);
  console.log('');

  if (args.yes !== true) {
    console.log('  Re-read the instance id above. A licence issued to the wrong one');
    console.log('  will be refused by that machine.');
    console.log('\n  Re-run with --yes to print the code.');
    process.exitCode = 2;
    return;
  }

  console.log('  LICENCE CODE\n');
  for (const line of code.match(/.{1,68}/g)) console.log(`    ${line}`);
  console.log('\n  Send this to the client. They paste it once into');
  console.log('  Settings > Licence. It is stored; they never enter it again.\n');

  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), code + '\n', 'utf8');
    console.log(`  Also written to ${args.out}\n`);
  }
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

function cmdVerify(args) {
  let code = args._[0] || args.code;
  if (!code && args.file) {
    // A licence code is long and easy to mistype; let owners point at the file
    // the client emailed them instead of pasting it.
    const f = path.resolve(args.file);
    if (!fs.existsSync(f)) {
      console.error(`\n  No such file: ${f}\n`);
      process.exitCode = 1;
      return;
    }
    code = fs.readFileSync(f, 'utf8').trim();
  }
  if (!code) {
    console.error('  Usage: license.js verify <code>');
    console.error('         license.js verify --file <code.txt>');
    process.exitCode = 1;
    return;
  }

  const keys = license.TRUSTED_PUBLIC_KEYS;
  if (!keys.length) {
    console.error('\n  license.js has no trusted public keys yet, so nothing can be');
    console.error('  verified here. Decode-only check:\n');
  }

  try {
    const parts = code.split('.');
    const payload = JSON.parse(zlib.inflateRawSync(Buffer.from(parts[1], 'base64url')).toString('utf8'));
    console.log('\n  PAYLOAD\n' + '  ' + '-'.repeat(46));
    console.log(`  instance : ${payload.i}`);
    console.log(`  customer : ${payload.c || '(none)'}`);
    console.log(`  valid    : ${payload.b} -> ${payload.x}`);
    console.log(`  key id   : ${payload.k}`);
    const trusted = keys.find((k) => k.keyId === payload.k);
    if (!trusted) {
      console.log('\n  WARNING: key id is not in TRUSTED_PUBLIC_KEYS - the app would');
      console.log('           refuse this licence.\n');
      process.exitCode = 1;
      return;
    }
    const ok = crypto.verify(null, Buffer.from(parts[1], 'base64url'),
      trusted.pem, Buffer.from(parts[2], 'base64url'));
    console.log(`\n  signature: ${ok ? 'VALID against the trusted key' : 'INVALID'}`);
    if (!ok) process.exitCode = 1;
    console.log('');
  } catch (e) {
    console.error(`\n  Cannot read that code: ${e.message}\n`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------

const COMMANDS = { keygen: cmdKeygen, issue: cmdIssue, verify: cmdVerify, request: cmdRequest };

const args = parseArgs(process.argv.slice(2));
const cmd = args._.shift();

if (!cmd || !COMMANDS[cmd]) {
  console.log(`
  TDQSYS licence tool

    keygen    Generate your keypair ONCE, offline. Prints the public key to
              paste into license.js. Refuses to overwrite an existing key.
    request   Read a client's activation request and show what they are asking for.
    issue     Sign a licence. Prints what it is about to issue first; pass
              --yes to emit the code.
    verify    Decode a licence and check its signature.

  issue examples
    node tools/license.js issue --request client-request.json \\
         --from 11-01 --until 11-06 --customer "Acme Auto Wash" --yes
    node tools/license.js issue --instance 8c8b6714-f300-413f-bf75-e1156662acfb \\
         --from 2026-11-01 --until 2027-11-01 --customer "Acme" --yes

  The private key lives at ${PRIVATE_PATH}
`);
  process.exitCode = 1;
} else {
  COMMANDS[cmd](args);
}