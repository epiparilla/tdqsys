'use strict';
// End-to-end proof against a real engine using the owner's real signing key.
//
// The integration suite signs with throwaway keys; this one uses the key that
// is actually in license.js, so it proves the shipped configuration accepts a
// licence the owner would actually hand a customer.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = 18112;
const BASE = `http://127.0.0.1:${PORT}`;
const CODE_FILE = path.join(os.tmpdir(), 'live-lic.txt');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdq-live-'));
const licDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdq-lic-'));
const code = fs.readFileSync(CODE_FILE, 'utf8').trim();

const child = spawn(process.execPath, [path.join(ROOT, 'video_server.js')], {
  cwd: dataDir,
  env: {
    ...process.env,
    AF_DATA_DIR: dataDir,
    AF_PORT: String(PORT),
    AF_LICENSE_DIR: licDir
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let out = '';
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { out += d; });

const api = (p, opts) => fetch(`${BASE}${p}`, opts);
const post = (p, body) => api(p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function main() {
  for (let i = 0; i < 60; i++) {
    try { if ((await api('/api/config')).ok) break; } catch { /* not up yet */ }
    await sleep(250);
  }

  // The console wraps codes across lines, so read them from --out. Scraping the
// wrapped output picks up the prose that follows and mangles the signature.
function issue(instanceId, customer) {
  const out = path.join(os.tmpdir(), `live-${customer.replace(/\W+/g, '-')}.txt`);
  require('child_process').execFileSync(process.execPath, [
    path.join(ROOT, 'tools', 'license.js'), 'issue',
    '--instance', instanceId,
    '--from', '2026-10-01', '--until', '2026-12-31',
    '--customer', customer, '--yes', '--out', out
  ], { encoding: 'utf8' });
  return fs.readFileSync(out, 'utf8').trim();
}

const cfg = await (await api('/api/config')).json();
  console.log(`engine instance: ${cfg.instanceId}\n`);

  // 1. Fresh install with no licence: reads fine, writes refused.
  let st = await (await api('/api/license')).json();
  check('no licence -> canWrite false', st.canWrite === false, st.state);

  let r = await post('/api/save', { queues: { brand1: { 1: 5 } } });
  check('no licence -> save refused', r.status === 403, `HTTP ${r.status}`);

  check('no licence -> reads still work', (await api('/api/data')).ok === true);

  // 2. A licence for someone ELSE must not unlock this machine. Real key, so
  //    this is the check that matters most: it proves instance binding holds
  //    for a licence the owner would actually have issued.
  const foreign = issue('00000000-0000-4000-8000-000000000000', 'Someone Else');

  const bad = await (await post('/api/license', { code: foreign })).json();
  check('another location\'s licence refused', bad.stored === false, bad.status && bad.status.state);
  check('a refused licence is not stored',
    (await (await api('/api/license')).json()).hasLicence === false);

  // 3. Issue for THIS engine's real instance id, using the owner's real key,
  //    then activate it.
  const mine = issue(cfg.instanceId, 'Live Engine Test');

  const act = await (await post('/api/license', { code: mine })).json();
  check('own real licence accepted', act.stored === true,
    act.stored ? '' : act.status && act.status.detail);
  check('customer matches', act.stored && act.status.customer === 'Live Engine Test');

  st = await (await api('/api/license')).json();
  check('canWrite now true', st.canWrite === true, st.state);
  check('dates surfaced', st.from === '2026-10-01' && st.until === '2026-12-31',
    `${st.from} -> ${st.until}`);

  r = await post('/api/save', { queues: { brand1: { 1: 5 } } });
  check('save accepted when licensed', r.status === 200, `HTTP ${r.status}`);

  const data = await (await api('/api/data')).json();
  check('save persisted', data.queues.brand1['1'] === 5);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  console.log(`\n--- engine log ---\n${out.trim().split('\n').slice(-8).join('\n')}`);
}

main()
  .catch((e) => { console.error('ERROR:', e.message); failures++; })
  .finally(async () => {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(licDir, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(failures === 0 ? 0 : 1);
  });