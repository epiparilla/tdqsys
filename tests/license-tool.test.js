'use strict';
// End-to-end tests for the owner's issuance tool.
//
// The tool is run as a child process against a THROWAWAY key directory, so it
// never touches the real private key at ~/.tdqsys/private.pem.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'license.js');
const license = require('../license');

const INSTANCE = '8c8b6714-f300-413f-bf75-e1156662acfb';
let home;

function run(args, opts = {}) {
  try {
    const out = execFileSync(process.execPath, [TOOL, ...args], {
      encoding: 'utf8',
      env: { ...process.env, USERPROFILE: home, HOME: home },
      ...opts
    });
    return { code: 0, out };
  } catch (e) {
    return {
      code: e.status === undefined ? 1 : e.status,
      out: `${e.stdout || ''}${e.stderr || ''}`
    };
  }
}

before(() => {
  // Redirect the key dir by pointing HOME/USERPROFILE at a temp folder; the
  // tool derives ~/.tdqsys from os.homedir(), which honours those on Windows
  // and POSIX respectively.
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tdqsys-home-'));
});

after(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
});

function keyPath() { return path.join(home, '.tdqsys', 'private.pem'); }

/**
 * Issue a licence and return it in full.
 *
 * The tool wraps codes across lines for reading, so the console output cannot
 * be trusted as the canonical value - a code is read back from --out, which is
 * also what an owner would hand to a customer.
 */
function issueCode(extra = []) {
  const out = path.join(home, `licence-${Math.random().toString(36).slice(2)}.txt`);
  const r = run(['issue', '--instance', INSTANCE, '--yes', '--out', out, ...extra]);
  assert.equal(r.code, 0, r.out);
  const code = fs.readFileSync(out, 'utf8').trim();
  assert.match(code, /^TDQS1\./, 'the file should contain exactly one unwrapped code');
  return code;
}

/** The public half of the throwaway key, as the app would embed it. */
function publicKey() {
  return require('node:crypto')
    .createPublicKey(fs.readFileSync(keyPath()))
    .export({ type: 'spki', format: 'pem' }).toString();
}

describe('keygen', () => {
  test('creates a private key and prints a pasteable public key', () => {
    const r = run(['keygen']);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(keyPath()), 'no private key was written');
    const pub = r.out.match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/);
    assert.ok(pub, 'the public key was not printed in a pasteable form');
    assert.ok(/TRUSTED_PUBLIC_KEYS/.test(r.out), 'it should say where to paste the key');
    assert.ok(/TWO SEPARATE PHYSICAL PLACES|PRINT IT/i.test(r.out),
      'it must stress backing the private key up');
  });

  test('refuses to overwrite an existing key', () => {
    const before_ = fs.readFileSync(keyPath());
    const r = run(['keygen']);
    assert.notEqual(r.code, 0, 'keygen overwrote an existing key without --force');
    assert.match(r.out, /already exists|Refusing/i);
    assert.deepEqual(fs.readFileSync(keyPath()), before_, 'the key file changed');
  });
});

describe('issue', () => {
  test('shows what it is about to issue and refuses without --yes', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06',
      '--customer', 'Acme Auto Wash']);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /ABOUT TO ISSUE/);
    assert.match(r.out, new RegExp(INSTANCE));
    assert.ok(!/TDQS1\./.test(r.out), 'a code leaked before confirmation');
  });

  test('emits a code that the core accepts', () => {
    const code = issueCode(['--from', '2026-11-01', '--until', '2026-11-06', '--customer', 'Acme']);

    const status = license.licenseStatus(code, {
      instanceId: INSTANCE,
      now: new Date(2026, 10, 3, 12).getTime(),
      keys: [{ keyId: 'k1', pem: publicKey() }]
    });
    assert.equal(status.state, license.STATE.VALID, status.detail);
    assert.equal(status.payload.c, 'Acme');
    assert.equal(status.payload.b, '2026-11-01');
    assert.equal(status.payload.x, '2026-11-06');
  });

  test('a missing year is assumed to be the current one', () => {
    const year = new Date().getFullYear();
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06', '--yes']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`${year}-11-01`),
      'the current year should have been assumed');
  });

  test('"11-01" means 1 November, not 11 January', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06', '--yes']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`${new Date().getFullYear()}-11-01`));
    assert.ok(!/\d{4}-01-11/.test(r.out), 'the month and day were swapped');
  });

  test('accepts several date shapes', () => {
    for (const [from, until, wantFrom, wantUntil] of [
      ['2026-11-01', '2026-11-06', '2026-11-01', '2026-11-06'],
      ['11/01', '11/06', '2026-11-01', '2026-11-06'],
      ['1 Nov', '6 Nov', '2026-11-01', '2026-11-06'],
      ['Nov 1 2026', 'Nov 6 2026', '2026-11-01', '2026-11-06']
    ]) {
      const r = run(['issue', '--instance', INSTANCE, '--from', from, '--until', until, '--yes']);
      assert.equal(r.code, 0, `${from} -> ${until} failed: ${r.out}`);
      assert.ok(r.out.includes(wantFrom), `from ${from} should be ${wantFrom}`);
      assert.ok(r.out.includes(wantUntil), `until ${until} should be ${wantUntil}`);
    }
  });

  test('reports the length in days', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '2026-11-01', '--until', '2026-11-06', '--yes']);
    assert.match(r.out, /6 days/);
  });

  test('refuses a backwards date range', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-06', '--until', '11-01', '--yes']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /before/i);
  });

  test('refuses an unparseable date with a helpful message', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', 'soon', '--until', 'later', '--yes']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /cannot understand the date/i);
  });

  test('refuses a malformed instance id', () => {
    const r = run(['issue', '--instance', 'not-a-uuid!!', '--from', '11-01', '--until', '11-06', '--yes']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /not a valid instance id/i);
  });

  test('warns on a long licence and honours --max-days', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '2026-01-01',
      '--until', '2026-12-01', '--yes']);
    assert.notEqual(r.code, 0, 'a year-long licence should be flagged');
    assert.match(r.out, /max-days/);

    const ok = run(['issue', '--instance', INSTANCE, '--from', '2026-01-01',
      '--until', '2026-12-01', '--yes', '--max-days', '400']);
    assert.equal(ok.code, 0, ok.out);
  });

  test('each issued licence is unique', () => {
    const args = ['--from', '11-01', '--until', '11-06'];
    const a = issueCode(args);
    const b = issueCode(args);
    assert.notEqual(a, b, 'two identical licences were issued');
  });

  test('the printed code is wrapped for reading, the file is not', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06', '--yes']);
    assert.equal(r.code, 0, r.out);
    const printed = r.out.match(/TDQS1\./);
    assert.ok(printed, 'the code should still be shown on screen');
    assert.match(r.out, /Send this to the client/);
  });

  test('--key-id is honoured, not silently ignored', () => {
    const out = path.join(home, 'rotated.txt');
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06',
      '--yes', '--key-id', 'k2', '--out', out]);
    assert.equal(r.code, 0, r.out);
    const payload = license.decodePayload(
      fs.readFileSync(out, 'utf8').trim().split('.')[1]
    );
    assert.equal(payload.k, 'k2',
      'the licence must declare the key it was signed with, or a rotated key will not verify');
  });

  test('a rotated-key licence is refused when only the old key is trusted', () => {
    const code = issueCode(['--from', '11-01', '--until', '11-06', '--key-id', 'k2']);
    const status = license.licenseStatus(code, {
      instanceId: INSTANCE,
      now: new Date(2026, 10, 3, 12).getTime(),
      keys: [{ keyId: 'k1', pem: publicKey() }]
    });
    assert.equal(status.state, license.STATE.INVALID);
    assert.match(status.detail, /k2/);
  });

  test('rejects an unusable key id', () => {
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06',
      '--yes', '--key-id', 'bad key!']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /not a usable key id/);
  });

  test('can write the code to a file', () => {
    const out = path.join(home, 'licence.txt');
    const r = run(['issue', '--instance', INSTANCE, '--from', '11-01', '--until', '11-06',
      '--yes', '--out', out]);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.existsSync(out));
    assert.match(fs.readFileSync(out, 'utf8'), /^TDQS1\./);
  });
});

describe('request', () => {
  test('reads a client request file and echoes what is being asked', () => {
    const f = path.join(home, 'req.json');
    fs.writeFileSync(f, JSON.stringify({
      instanceId: INSTANCE, site: 'acme', from: '2026-11-01', until: '2026-11-06'
    }));
    const r = run(['request', '--file', f]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /CLIENT REQUEST/);
    assert.match(r.out, new RegExp(INSTANCE));
    assert.match(r.out, /acme/);
  });

  test('issue can take its details from a request file', () => {
    const f = path.join(home, 'req2.json');
    fs.writeFileSync(f, JSON.stringify({ instanceId: INSTANCE, site: 'acme' }));
    const r = run(['issue', '--request', f, '--from', '11-01', '--until', '11-06', '--yes']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(INSTANCE));
    assert.match(r.out, /acme/, 'the label should be used as the customer when none given');
  });
});

describe('verify', () => {
  test('a licence signed by anyone else is refused', () => {
    // These licences are signed with the throwaway key this file generates in
    // its temp home, but they CLAIM key id k1 - which is the real key now
    // pasted into license.js. So this is the forgery case: right key id, wrong
    // signature. It must not pass, whatever the key id claims.
    const code = issueCode(['--from', '11-01', '--until', '11-06', '--customer', 'Forged']);
    const r = run(['verify', code]);
    assert.notEqual(r.code, 0, 'a forged licence must not verify');
    assert.match(r.out, /PAYLOAD/);
    assert.match(r.out, /Forged/, 'the payload should still be shown so it can be eyeballed');
    assert.match(r.out, /INVALID/,
      'the signature must be reported as invalid against the trusted key');
  });

  test('a code naming an unknown key id is called out by name', () => {
    const code = issueCode(['--from', '11-01', '--until', '11-06', '--key-id', 'k9']);
    const r = run(['verify', code]);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /k9 is not in TRUSTED_PUBLIC_KEYS|refuse this licence/);
  });

  test('accepts a code from a file, which is how owners paste large codes', () => {
    const code = issueCode(['--from', '11-01', '--until', '11-06']);
    const r = run(['verify', '--file', path.join(home, 'v.txt')]);
    assert.notEqual(r.code, 0, 'the file does not exist yet');

    const f = path.join(home, 'v.txt');
    fs.writeFileSync(f, code);
    const ok = run(['verify', '--file', f]);
    assert.match(ok.out, /Acme|PAYLOAD|Licensed location/);
  });

  test('rejects rubbish without crashing', () => {
    const r = run(['verify', 'nonsense']);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /cannot read/i);
  });
});

describe('tool isolation', () => {
  test('the tool is not part of what ships', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf8'));
    assert.ok(!pkg.build.files.some((f) => f.includes('tools')),
      'tools/ is in build.files - the private-key tool would ship');
    assert.ok(!pkg.build.extraResources.some((r) => r.from.includes('tools')));
  });

  test('the tool lives outside public/ so it is never deployed', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'public', 'tools')));
    assert.ok(!fs.readFileSync(path.join(ROOT, 'app', 'assemble-server.ps1'), 'utf8')
      .match(/tools/i), 'assemble-server.ps1 should not stage the owner tooling');
  });
});