'use strict';
// One-shot: paste the public key into license.js.
//
// Derives the public half from private.pem rather than retyping the PEM that
// keygen printed. Reading the printed output back turned out to be unreliable
// (PowerShell 5.1's Tee-Object writes UTF-16), and a transcription slip would
// produce a build that rejects its own licences with no obvious cause.
// Deriving also proves the two halves actually match.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const licenseFile = path.join(ROOT, 'license.js');

const privPath = process.argv[2]
  || path.join(process.env.AF_LICENSE_DIR || path.join(os.homedir(), '.tdqsys'), 'private.pem');

if (!fs.existsSync(privPath)) {
  console.error('No private key at', privPath);
  console.error('Run:  node tools/license.js keygen');
  process.exit(1);
}

const pem = crypto.createPublicKey(fs.readFileSync(privPath))
  .export({ type: 'spki', format: 'pem' }).toString().trim();

// Sanity: an Ed25519 SPKI is a 12-byte DER header wrapping a 32-byte key, so
// 44 bytes of DER, which base64-encodes to exactly 60 characters.
const body = pem.split('\n').filter((l) => !l.includes('-----')).join('');
if (body.length !== 60) {
  console.error(`Expected a 60-char Ed25519 SPKI body, got ${body.length}: ${body}`);
  process.exit(1);
}

let src = fs.readFileSync(licenseFile, 'utf8');
const re = /const TRUSTED_PUBLIC_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/;
if (!re.test(src)) {
  console.error('Could not find TRUSTED_PUBLIC_KEYS in license.js');
  process.exit(1);
}

const replacement = [
  'const TRUSTED_PUBLIC_KEYS = Object.freeze([',
  "  { keyId: 'k1', pem: `" + pem.replace(/\n/g, '\\n') + '` }',
  ']);'
].join('\n');

src = src.replace(re, replacement);
fs.writeFileSync(licenseFile, src, 'utf8');
console.log('Pasted keyId k1 into license.js');

// Prove the file still loads and reports the key, rather than assuming.
delete require.cache[require.resolve(licenseFile)];
const lic = require(licenseFile);
console.log('keyIds now:', lic.KEY_IDS);
if (lic.KEY_IDS.length !== 1 || lic.KEY_IDS[0] !== 'k1') {
  console.error('license.js does not report key k1');
  process.exit(1);
}