'use strict';
// Optional real PostgreSQL engine checks. Install the isolated test runtime:
// npm.cmd install --prefix .dev-db --no-package-lock @electric-sql/pglite
// node tests/test-drive-db.integration.js
const { PGlite } = require('../.dev-db/node_modules/@electric-sql/pglite');
const { pgcrypto } = require('../.dev-db/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('hex');
const A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', B = '11111111-2222-4333-8444-555555555555';

(async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  let count = 0;
  async function check(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
  async function rpc(name, args) {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
    return (await db.query(`select to_jsonb(public.${name}(${placeholders})) as value`, args)).rows[0].value;
  }
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611010001_test_drive_platform.sql'), 'utf8'));
    const models = [{ fullName: 'RAV4', shortname: 'RAV4', brandKey: 'brand1', unit: 1 }, { fullName: 'Camry', shortname: 'CAMRY', brandKey: 'brand1', unit: 2 }];
    await rpc('tdqsys_configure_test_drive', [A, JSON.stringify(models), 'Approved waiver', 'Approved terms']);
    const modelIds = (await db.query('select id from vehicle_models where instance_id=$1 order by full_name', [A])).rows.map(m => m.id);
    const run = await rpc('tdqsys_open_queue_run', [A, '2026-11-01', 'Testing', 'facilitator']);
    await rpc('tdqsys_register_se_checkin', [A, 'SE One', 'Toyota', '2026-11-01', hash('0123'), 'encrypted-test-fixture', '2099-11-02T00:00:00Z']);
    const args = key => [A, 'Ana Cruz', 'ana cruz', 'ana@example.com', 'Manila', '09170000000', null, null, hash('0123'), hash('Approved waiver'), hash('Approved terms'), key, modelIds];
    let first;
    await check('multi-model submission creates two tickets and two pending print jobs', async () => {
      first = await rpc('tdqsys_submit_registration', args('request-0001'));
      assert.equal(first.entries.length, 2);
      assert.equal((await db.query("select count(*)::int as n from print_jobs where kind='client_ticket'")).rows[0].n, 2);
    });
    await check('same request replays the complete original result', async () => {
      assert.deepEqual(await rpc('tdqsys_submit_registration', args('request-0001')), first);
      assert.equal((await db.query('select count(*)::int as n from registrations')).rows[0].n, 1);
    });
    await check('same name and models return existing unpassed ticket numbers', async () => {
      const second = await rpc('tdqsys_submit_registration', args('request-0002'));
      assert.ok(second.entries.every(e => e.existing && e.queueNumber === 1));
      assert.deepEqual(await rpc('tdqsys_submit_registration', args('request-0002')), second);
    });
    await check('forged consent versions roll back completely', async () => {
      const forged = args('request-forged'); forged[9] = 'forged';
      await assert.rejects(rpc('tdqsys_submit_registration', forged), /consent text changed/);
    });
    await check('Ongoing completes previous entry across models', async () => {
      await rpc('tdqsys_set_ongoing', [first.entries[0].entryId, 'facilitator']);
      await rpc('tdqsys_set_ongoing', [first.entries[1].entryId, 'facilitator']);
      const states = (await db.query('select status from test_drive_entries order by status')).rows.map(r => r.status);
      assert.deepEqual(states, ['done', 'ongoing']);
    });
    await check('another location cannot mark this location ticket', async () => {
      await assert.rejects(rpc('tdqsys_mark_entry', [B, first.entries[1].entryId, 'no_show']), /entry not in active run/);
    });
    await check('print claim is exclusive', async () => {
      const job = (await db.query("select id from print_jobs where kind='client_ticket' limit 1")).rows[0].id;
      const payload = await rpc('tdqsys_claim_print_job', [A, job]);
      assert.ok(payload.header); assert.equal(payload.value, '01');
      await assert.rejects(rpc('tdqsys_claim_print_job', [A, job]), /print job not available/);
    });
    await check('same-day reset preserves client records and restarts at one', async () => {
      const nextRun = await rpc('tdqsys_open_queue_run', [A, '2026-11-01', 'Testing again', 'facilitator']);
      assert.equal(nextRun.run_number, run.run_number + 1);
      const next = await rpc('tdqsys_submit_registration', args('request-0003'));
      assert.ok(next.entries.every(e => e.queueNumber === 1 && !e.existing));
      assert.equal((await db.query('select count(*)::int as n from test_drive_entries')).rows[0].n, 4);
      await assert.rejects(rpc('tdqsys_set_ongoing', [first.entries[0].entryId, 'facilitator']), /active run/);
    });
    await check('SE duplicate codes are rejected by database uniqueness', async () => {
      await assert.rejects(rpc('tdqsys_register_se_checkin', [A, 'Another SE', 'Toyota', '2026-11-01', hash('0123'), 'cipher', '2099-11-02T00:00:00Z']), /unique constraint/);
    });
    await check('anonymous role cannot access registrations', async () => {
      await db.exec('set role anon');
      try { await assert.rejects(db.query('select * from registrations'), /permission denied/); }
      finally { await db.exec('reset role'); }
    });
    await check('earlier-run reissue creates a fresh entry in current run', async () => {
      const result = await rpc('tdqsys_reissue_ticket',[A,first.entries[0].entryId,null,false]);
      assert.equal(result.reprint,false); assert.equal(result.queueNumber,2);
      const old = (await db.query('select queue_number from test_drive_entries where id=$1',[first.entries[0].entryId])).rows[0];
      assert.equal(old.queue_number,1);
    });
    await check('Sheets jobs are claimed exclusively and failed jobs retain a retry schedule', async () => {
      const job = await rpc('tdqsys_claim_sheet_job',[A]); assert.ok(job.claim_token);
      assert.equal(await rpc('tdqsys_finish_sheet_job',[B,job.id,job.claim_token,'wrong location']),false);
      assert.equal(await rpc('tdqsys_finish_sheet_job',[A,job.id,job.claim_token,'offline']),true);
      const saved = (await db.query('select status,next_attempt_at>now() as scheduled from sheet_sync_jobs where id=$1',[job.id])).rows[0];
      assert.equal(saved.status,'failed'); assert.equal(saved.scheduled,true);
    });
    console.log(`${count} PostgreSQL integration checks passed.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
