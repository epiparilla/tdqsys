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
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611010002_per_model_ongoing.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020001_sales_executive_reset.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020002_ticket_labels_se_reprint.sql'), 'utf8'));
    const today = (await db.query("select to_char(now() at time zone 'Asia/Manila','YYYY-MM-DD') as day")).rows[0].day;
    const models = [{ fullName: 'RAV4', shortname: 'RAV4', brandKey: 'brand1', unit: 1 }, { fullName: 'Camry', shortname: 'CAMRY', brandKey: 'brand1', unit: 2 }];
    await rpc('tdqsys_configure_test_drive', [A, JSON.stringify(models), 'Approved waiver', 'Approved terms']);
    const modelIds = (await db.query('select id from vehicle_models where instance_id=$1 order by full_name', [A])).rows.map(m => m.id);
    const run = await rpc('tdqsys_open_queue_run', [A, today, 'Testing', 'facilitator']);
    await rpc('tdqsys_register_se_checkin', [A, 'SE One', 'Toyota', today, hash('0123'), 'encrypted-test-fixture', '2099-11-02T00:00:00Z']);
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
    await check('each vehicle model retains its own ongoing client', async () => {
      await rpc('tdqsys_set_ongoing', [first.entries[0].entryId, 'facilitator']);
      await rpc('tdqsys_set_ongoing', [first.entries[1].entryId, 'facilitator']);
      const states = (await db.query('select status from test_drive_entries order by status')).rows.map(r => r.status);
      assert.deepEqual(states, ['ongoing', 'ongoing']);
    });
    await check('advancing one model completes only its previous client',async()=>{
      await db.exec('begin');
      try{
        const nextArgs=args('request-model-advance');nextArgs[1]='Another Client';nextArgs[2]='another client';
        const next=await rpc('tdqsys_submit_registration',nextArgs);
        const target=next.entries.find(e=>e.modelId===first.entries[0].modelId);
        await rpc('tdqsys_set_ongoing',[target.entryId,'facilitator']);
        const original=(await db.query('select id,status from test_drive_entries where id=any($1::uuid[])',[first.entries.map(e=>e.entryId)])).rows;
        assert.equal(original.find(e=>e.id===first.entries[0].entryId).status,'done');
        assert.equal(original.find(e=>e.id===first.entries[1].entryId).status,'ongoing');
        await assert.rejects(db.query("update test_drive_entries set status='ongoing' where id=$1",[first.entries[0].entryId]),/unique constraint/);
      }finally{await db.exec('rollback');}
    });
    await check('another location cannot mark this location ticket', async () => {
      await assert.rejects(rpc('tdqsys_mark_entry', [B, first.entries[1].entryId, 'no_show']), /entry not in active run/);
    });
    await check('print claim is exclusive', async () => {
      const job = (await db.query("select id from print_jobs where kind='client_ticket' limit 1")).rows[0].id;
      const payload = await rpc('tdqsys_claim_print_job', [A, job]);
      assert.ok(payload.header); assert.equal(payload.value, '01');
      assert.equal(payload.brandKey,'brand1');assert.ok(payload.unit);assert.equal(payload.queueNumber,1);
      await assert.rejects(rpc('tdqsys_claim_print_job', [A, job]), /print job not available/);
    });
    await check('same-day reset preserves client records and restarts at one', async () => {
      const nextRun = await rpc('tdqsys_open_queue_run', [A, today, 'Testing again', 'facilitator']);
      assert.equal(nextRun.run_number, run.run_number + 1);
      const next = await rpc('tdqsys_submit_registration', args('request-0003'));
      assert.ok(next.entries.every(e => e.queueNumber === 1 && !e.existing));
      assert.equal((await db.query('select count(*)::int as n from test_drive_entries')).rows[0].n, 4);
      await assert.rejects(rpc('tdqsys_set_ongoing', [first.entries[0].entryId, 'facilitator']), /active run/);
    });
    await check('SE duplicate codes are rejected by database uniqueness', async () => {
      await assert.rejects(rpc('tdqsys_register_se_checkin', [A, 'Another SE', 'Toyota', today, hash('0123'), 'cipher', '2099-11-02T00:00:00Z']), /unique constraint/);
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
    await check('SE reprint reuses a pending slip, keeps its code, and refuses expired or foreign check-ins',async()=>{
      const checkin=(await db.query('select id from se_daily_checkins where instance_id=$1',[A])).rows[0].id;
      const firstJob=await rpc('tdqsys_reprint_se_code',[A,checkin]);
      assert.deepEqual(await rpc('tdqsys_reprint_se_code',[A,checkin]),firstJob);
      await db.query("update print_jobs set status='printed' where id=$1",[firstJob.jobId]);
      const nextJob=await rpc('tdqsys_reprint_se_code',[A,checkin]);assert.notEqual(nextJob.jobId,firstJob.jobId);
      const label=await rpc('tdqsys_claim_print_job',[A,nextJob.jobId]);assert.equal(label.ciphertext,'encrypted-test-fixture');
      await assert.rejects(rpc('tdqsys_reprint_se_code',[A,checkin]),/being printed/);
      await assert.rejects(rpc('tdqsys_reprint_se_code',[B,checkin]),/expired or reset/);
      await db.query("update print_jobs set status='failed' where id=$1",[nextJob.jobId]);
    });
    await check('SE reset invalidates codes, retains clients and queues, and permits fresh same-day check-in without code reuse', async () => {
      const other=await rpc('tdqsys_register_se_checkin',[B,'Other SE','Other Dealer',today,hash('0123'),'other-cipher','2099-11-02T00:00:00Z']);
      const before=await db.query('select id,se_daily_checkin_id from registrations where instance_id=$1 order by id',[A]);
      const queues=await db.query('select * from queue_counters order by queue_run_id,vehicle_model_id');
      const runBefore=await db.query("select id from queue_runs where instance_id=$1 and status='active'",[A]);
      const reset=await rpc('tdqsys_reset_sales_executives',[A,'Testing SE registrations']);assert.equal(reset.deactivated,1);
      assert.deepEqual((await db.query('select id,se_daily_checkin_id from registrations where instance_id=$1 order by id',[A])).rows,before.rows);
      assert.deepEqual((await db.query('select * from queue_counters order by queue_run_id,vehicle_model_id')).rows,queues.rows);
      assert.deepEqual((await db.query("select id from queue_runs where instance_id=$1 and status='active'",[A])).rows,runBefore.rows);
      assert.equal((await db.query('select revoked_at is null and expires_at>now() as active from se_daily_checkins where id=$1',[other])).rows[0].active,true);
      assert.equal((await db.query("select count(*)::int as n from print_jobs where instance_id=$1 and kind='se_code_slip' and status in ('pending','claimed','failed')",[A])).rows[0].n,0);
      await assert.rejects(rpc('tdqsys_submit_registration',args('after-se-reset')),/invalid or expired/);
      const fresh=await rpc('tdqsys_register_se_checkin',[A,'SE One','Toyota',today,hash('4567'),'fresh-cipher','2099-11-02T00:00:00Z']);assert.ok(fresh);
      assert.equal((await db.query('select count(*)::int as n from se_daily_checkins where instance_id=$1',[A])).rows[0].n,2);
      await assert.rejects(rpc('tdqsys_register_se_checkin',[A,'Another SE','Toyota',today,hash('0123'),'cipher','2099-11-02T00:00:00Z']),/unique constraint/);
    });
    await check('three locations retain independent Sheet destinations and public form configurations', async () => {
      const C='33333333-4444-4555-8666-777777777777';
      const locations=[A,B,C];
      for (const [index,instance] of locations.entries()) {
        await rpc('tdqsys_configure_test_drive',[instance,JSON.stringify([{fullName:`Location ${index+1} vehicle`,shortname:`LOC${index+1}`,brandKey:'brand1',unit:1}]),`Waiver ${index+1}`,`Terms ${index+1}`,`https://docs.google.com/spreadsheets/d/location-${index+1}/edit#gid=0`]);
      }
      const targets=(await db.query('select instance_id,google_sheet_url from test_drive_settings')).rows;
      assert.equal(new Set(targets.map(t=>t.google_sheet_url)).size,3);
      for (const [index,instance] of locations.entries()) {
        const config=await rpc('tdqsys_public_registration_config',[instance]);
        assert.equal(config.models.length,1); assert.equal(config.models[0].name,`Location ${index+1} vehicle`);
        assert.equal(config.waiverStatement,`Waiver ${index+1}`);
        assert.equal(Object.hasOwn(config,'google_sheet_url'),false);
      }
    });
    console.log(`${count} PostgreSQL integration checks passed.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
