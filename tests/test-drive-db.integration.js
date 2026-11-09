'use strict';
// Optional real PostgreSQL engine checks. Install the isolated test runtime:
// npm.cmd install --prefix .dev-db --no-package-lock @electric-sql/pglite
// node tests/test-drive-db.integration.js
const { PGlite } = require('../.dev-db/node_modules/@electric-sql/pglite');
const { pgcrypto } = require('../.dev-db/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash,randomUUID } = require('node:crypto');
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
    // Reproduce hosted defaults BEFORE all platform migrations, not only newer ones.
    await db.exec('alter default privileges grant execute on functions to anon,authenticated;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611010001_test_drive_platform.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611010002_per_model_ongoing.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020001_sales_executive_reset.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020002_ticket_labels_se_reprint.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020003_direct_reprint_cancel.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611020004_registration_dealerships.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611030001_local_operation_sync.sql'), 'utf8'));
    // Hosted Supabase can grant browser roles EXECUTE through default privileges.
    await db.exec('alter default privileges grant execute on functions to anon,authenticated;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611060001_giveaways.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611060002_inventory_dashboard.sql'), 'utf8'));
    const today = (await db.query("select to_char(now() at time zone 'Asia/Manila','YYYY-MM-DD') as day")).rows[0].day;
    const models = [{ fullName: 'RAV4', shortname: 'RAV4', brandKey: 'brand1', unit: 1 }, { fullName: 'Camry', shortname: 'CAMRY', brandKey: 'brand1', unit: 2 }];
    await rpc('tdqsys_configure_registration', [A, JSON.stringify(models), 'Approved waiver', 'Approved terms','',JSON.stringify(['Toyota'])]);
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
    await check('passed 01 with displayed 02 and issued 03/04 creates printable 05; unpassed reprint reuses its exact job', async()=>{
      await db.exec('begin');
      try {
        let second;
        for(let number=2;number<=4;number++) {
          const next=args(`direct-print-${number}`);next[1]=`Client ${number}`;next[2]=`client ${number}`;next[12]=[first.entries[0].modelId];
          const issued=await rpc('tdqsys_submit_registration',next);
          if(number===2)second=issued.entries[0];
        }
        await rpc('tdqsys_set_ongoing',[second.entryId,'facilitator']);
        const replacement=await rpc('tdqsys_reissue_ticket',[A,first.entries[0].entryId,null,false]);
        assert.equal(replacement.queueNumber,5);assert.equal(replacement.reprint,false);
        assert.equal((await rpc('tdqsys_claim_print_job',[A,replacement.jobId])).queueNumber,5);
        assert.equal((await db.query('select status from print_jobs where test_drive_entry_id=$1',[first.entries[0].entryId])).rows[0].status,'cancelled');
        const unpassed=await rpc('tdqsys_reissue_ticket',[A,second.entryId,null,false]);assert.equal(unpassed.queueNumber,2);assert.equal(unpassed.reprint,true);
        assert.equal((await rpc('tdqsys_reissue_ticket',[A,second.entryId,null,false])).jobId,unpassed.jobId);
        await rpc('tdqsys_claim_print_job',[A,unpassed.jobId]);
        await assert.rejects(rpc('tdqsys_reissue_ticket',[A,second.entryId,null,false]),/being printed/);
      } finally {await db.exec('rollback');}
    });
    await check('print cancellation is scoped, refuses claimed output, and preserves the ticket and registration',async()=>{
      await db.exec('begin');
      try {
        const job=(await db.query("select id,test_drive_entry_id from print_jobs where kind='client_ticket' limit 1")).rows[0];
        await db.exec('savepoint foreign_cancel');
        await assert.rejects(rpc('tdqsys_cancel_print_job',[B,job.id]),/only pending/);
        await db.exec('rollback to savepoint foreign_cancel');
        await rpc('tdqsys_cancel_print_job',[A,job.id]);
        assert.equal((await db.query('select status from print_jobs where id=$1',[job.id])).rows[0].status,'cancelled');
        assert.equal((await db.query('select count(*)::int n from test_drive_entries where id=$1',[job.test_drive_entry_id])).rows[0].n,1);
        await db.exec('savepoint cancelled_claim');
        await assert.rejects(rpc('tdqsys_claim_print_job',[A,job.id]),/not available/);
        await db.exec('rollback to savepoint cancelled_claim');
        const replacement=await rpc('tdqsys_reissue_ticket',[A,job.test_drive_entry_id,null,false]);
        await rpc('tdqsys_claim_print_job',[A,replacement.jobId]);
        await assert.rejects(rpc('tdqsys_cancel_print_job',[A,replacement.jobId]),/only pending/);
      } finally {await db.exec('rollback');}
    });
    await check('local operation receipts prevent duplicate application and an old retry cannot undo a later status',async()=>{
      await db.exec('begin');
      try {
        const operation={id:randomUUID(),runId:run.id,entryId:first.entries[0].entryId,action:'ongoing',createdAt:new Date().toISOString()};
        const accepted=await rpc('tdqsys_apply_local_operation',[A,JSON.stringify(operation)]);
        assert.equal(accepted.operationId,operation.id);
        await rpc('tdqsys_apply_local_operation',[A,JSON.stringify({...operation,id:randomUUID(),action:'status',status:'done'})]);
        assert.deepEqual(await rpc('tdqsys_apply_local_operation',[A,JSON.stringify(operation)]),accepted);
        assert.equal((await db.query('select status from test_drive_entries where id=$1',[operation.entryId])).rows[0].status,'done');
        assert.equal((await db.query('select count(*)::int n from tdqsys_local_operation_receipts')).rows[0].n,2);
        await db.exec('savepoint payload_reuse');
        await assert.rejects(rpc('tdqsys_apply_local_operation',[A,JSON.stringify({...operation,action:'status',status:'no_show'})]),/different content/);
        await db.exec('rollback to savepoint payload_reuse');
        await db.exec('savepoint foreign_ticket');
        await assert.rejects(rpc('tdqsys_apply_local_operation',[A,JSON.stringify({...operation,id:randomUUID(),entryId:randomUUID()})]),/does not belong/);
        await db.exec('rollback to savepoint foreign_ticket');
        await assert.rejects(rpc('tdqsys_apply_local_operation',[B,JSON.stringify(operation)]),/run is no longer current|does not belong/);
      } finally {await db.exec('rollback');}
    });
    await check('queued operations from a reset run are rejected without creating receipts',async()=>{
      await db.exec('begin');
      try {
        await rpc('tdqsys_open_queue_run',[A,today,'Reset while desktop offline','facilitator']);
        await assert.rejects(rpc('tdqsys_apply_local_operation',[A,JSON.stringify({id:randomUUID(),runId:run.id,entryId:first.entries[0].entryId,action:'ongoing'})]),/run is no longer current/);
      } finally {await db.exec('rollback');}
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
      await rpc('tdqsys_configure_registration',[B,JSON.stringify(models),'Other waiver','Other terms','',JSON.stringify(['Other Dealer'])]);
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
    await check('dealership configuration is normalized, isolated and enforced without changing prior SE records',async()=>{
      await rpc('tdqsys_configure_registration',[A,JSON.stringify(models),'Approved waiver','Approved terms','',JSON.stringify(['  Toyota North  ','Toyota South','toyota north'])]);
      assert.deepEqual((await rpc('tdqsys_public_registration_config',[A])).dealerships,['Toyota North','Toyota South']);
      assert.deepEqual((await rpc('tdqsys_public_registration_config',[B])).dealerships,['Other Dealer']);
      await assert.rejects(rpc('tdqsys_register_se_checkin',[A,'Unlisted SE','Other Dealer',today,hash('7777'),'cipher','2099-11-02T00:00:00Z']),/configured dealership/);
      assert.equal((await db.query('select dealership from sales_executives where instance_id=$1 limit 1',[A])).rows[0].dealership,'Toyota');
      await assert.rejects(rpc('tdqsys_configure_registration',[A,JSON.stringify(models),'Approved waiver','Approved terms','',JSON.stringify([42])]),/invalid dealership/);
      await rpc('tdqsys_configure_registration',[A,JSON.stringify(models),'Approved waiver','Approved terms','',JSON.stringify([])]);
      await assert.rejects(rpc('tdqsys_register_se_checkin',[A,'Paused SE','Toyota North',today,hash('7777'),'cipher','2099-11-02T00:00:00Z']),/configured dealership/);
    });
    await check('giveaways preserve raw form snapshots, persist per registration and reject stale or foreign writes',async()=>{
      for(const role of ['anon','authenticated']) {
        const privileges=(await db.query("select has_function_privilege($1,'public.tdqsys_giveaway_snapshot(text)','execute') as read,has_function_privilege($1,'public.tdqsys_set_giveaway(text,uuid,text,text)','execute') as write",[role])).rows[0];
        assert.equal(privileges.read,false);assert.equal(privileges.write,false);
      }
      await rpc('tdqsys_configure_giveaways',[A,JSON.stringify([' Cap ','Tote','cap'])]);
      await rpc('tdqsys_add_giveaway_stock',[A,'Cap',10,'opening',randomUUID()]);
      await rpc('tdqsys_add_giveaway_stock',[A,'Tote',10,'opening',randomUUID()]);
      const before=await rpc('tdqsys_giveaway_snapshot',[A]);
      assert.deepEqual(before.giveawayItems,['Cap','Tote']);
      const row=before.registrations[0];assert.ok(row,'Expected prior test registration');
      assert.equal(row.giveawayItem,null);
      const payload=(await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[row.registrationId])).rows[0].payload_snapshot;
      assert.deepEqual(row.models,payload.models);
      const countBefore=before.registrations.length;
      const selected=await rpc('tdqsys_set_giveaway',[A,row.registrationId,'Cap',null]);assert.equal(selected.giveawayItem,'Cap');
      await assert.rejects(rpc('tdqsys_set_giveaway',[B,row.registrationId,'Cap',null]),/registration not found/);
      await assert.rejects(rpc('tdqsys_set_giveaway',[A,row.registrationId,'Tote',null]),/selection changed/);
      await assert.rejects(rpc('tdqsys_set_giveaway',[A,row.registrationId,'Unknown','Cap']),/configured giveaway/);
      const saved=await rpc('tdqsys_giveaway_snapshot',[A]);
      assert.equal(saved.registrations.length,countBefore);
      assert.equal(saved.registrations.find(r=>r.registrationId===row.registrationId).giveawayItem,'Cap');
      assert.deepEqual((await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[row.registrationId])).rows[0].payload_snapshot,payload);
      await rpc('tdqsys_configure_giveaways',[A,JSON.stringify(['Tote'])]);
      assert.equal((await rpc('tdqsys_giveaway_snapshot',[A])).registrations.find(r=>r.registrationId===row.registrationId).giveawayItem,'Cap','Retired items must remain recorded');
      await rpc('tdqsys_set_giveaway',[A,row.registrationId,null,'Cap']);
      assert.equal((await rpc('tdqsys_giveaway_snapshot',[A])).registrations.find(r=>r.registrationId===row.registrationId).giveawayItem,null);
      for(const bad of [['Unclaimed'],[42],['x'.repeat(161)]])await assert.rejects(rpc('tdqsys_configure_giveaways',[A,JSON.stringify(bad)]),/invalid giveaway/);
      const yesterday=(await db.query("select now()-interval '1 day' as value")).rows[0].value;
      await db.query('update registrations set submitted_at=$1 where id=$2',[yesterday,row.registrationId]);
      assert.equal((await rpc('tdqsys_giveaway_snapshot',[A])).registrations.some(r=>r.registrationId===row.registrationId),false);
    });
    await check('stock opening/replenishments are immutable, idempotent, private and location scoped',async()=>{
      const request=randomUUID();
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify(['Bottle','Sticker','Single']),JSON.stringify([
        {item:'Bottle',quantity:2,requestId:randomUUID()},{item:'Sticker',quantity:0,requestId:randomUUID()},{item:'Single',quantity:1,requestId:randomUUID()}])]);
      await rpc('tdqsys_add_giveaway_stock',[A,'Bottle',3,'replenishment',request]);
      assert.equal((await rpc('tdqsys_add_giveaway_stock',[A,'Bottle',3,'replenishment',request])).replayed,true);
      await assert.rejects(rpc('tdqsys_add_giveaway_stock',[A,'Bottle',4,'replenishment',request]),/different values/);
      await assert.rejects(rpc('tdqsys_add_giveaway_stock',[A,'Bottle',4,'opening',randomUUID()]),/already recorded/);
      await assert.rejects(rpc('tdqsys_add_giveaway_stock',[B,'Bottle',3,'replenishment',randomUUID()]),/Settings first/);
      await assert.rejects(rpc('tdqsys_add_giveaway_stock',[A,'Bottle',0,'replenishment',randomUUID()]),/valid stock quantity/);
      const snapshot=await rpc('tdqsys_giveaway_stock_history',[A]);
      assert.equal(snapshot.inventory.find(item=>item.item==='Bottle').supplied,5);
      assert.equal(snapshot.inventory.find(item=>item.item==='Bottle').opening,2);
      assert.equal(snapshot.history.filter(event=>event.item==='Bottle').length,2);
      for(const role of ['anon','authenticated'])for(const fn of ['tdqsys_giveaway_stock_history(text)','tdqsys_dashboard_snapshot(text,uuid)','tdqsys_add_giveaway_stock(text,text,integer,text,uuid)']) {
        assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,'public.'+fn,'execute'])).rows[0].allowed,false);
      }
    });
    await check('giveaway deductions, corrections and stock exhaustion are atomic and never oversell',async()=>{
      const ids=(await db.query('select id from registrations where instance_id=$1 and giveaway_item is null order by submitted_at limit 2',[A])).rows.map(row=>row.id);
      assert.equal(ids.length,2);
      await rpc('tdqsys_set_giveaway',[A,ids[0],'Bottle',null]);
      await rpc('tdqsys_set_giveaway',[A,ids[1],'Bottle',null]);
      let stock=await rpc('tdqsys_inventory_snapshot',[A,null]);assert.equal(stock.find(item=>item.item==='Bottle').remaining,3);
      await assert.rejects(rpc('tdqsys_set_giveaway',[A,ids[1],'Sticker','Bottle']),/out of stock/);
      assert.equal((await db.query('select giveaway_item from registrations where id=$1',[ids[1]])).rows[0].giveaway_item,'Bottle');
      await rpc('tdqsys_set_giveaway',[A,ids[0],null,'Bottle']);
      await rpc('tdqsys_set_giveaway',[A,ids[1],'Single','Bottle']);
      await assert.rejects(rpc('tdqsys_set_giveaway',[A,ids[0],'Single',null]),/out of stock/);
      stock=await rpc('tdqsys_inventory_snapshot',[A,null]);
      assert.equal(stock.find(item=>item.item==='Single').remaining,0);assert.equal(stock.find(item=>item.item==='Bottle').remaining,5);
    });
    await check('dashboard run history freezes stock at close and separates registrations, model clients and tickets',async()=>{
      const before=await rpc('tdqsys_dashboard_snapshot',[A,null]);assert.ok(before.run);
      const closedId=before.run.id;
      await assert.rejects(rpc('tdqsys_dashboard_snapshot',[B,closedId]),/not found for this location/);
      await rpc('tdqsys_open_queue_run',[A,today,'Inventory history test','tester']);
      const historical=await rpc('tdqsys_dashboard_snapshot',[A,closedId]);
      const closingBottle=historical.inventory.find(item=>item.item==='Bottle').remaining;
      await rpc('tdqsys_add_giveaway_stock',[A,'Bottle',10,'replenishment',randomUUID()]);
      assert.equal((await rpc('tdqsys_dashboard_snapshot',[A,closedId])).inventory.find(item=>item.item==='Bottle').remaining,closingBottle);
      const submitted=args('inventory-dashboard-registration');submitted[8]=hash('4567');
      const fresh=await rpc('tdqsys_submit_registration',submitted);assert.equal(fresh.entries.length,2);
      const live=await rpc('tdqsys_dashboard_snapshot',[A,null]);
      assert.equal(live.registered,1);assert.equal(live.queuedClients,1);assert.equal(live.tickets,2);
      assert.ok(live.models.every(model=>model.registered===1));
      assert.equal(live.inventory.find(item=>item.item==='Bottle').beginning,closingBottle);
      assert.equal(live.inventory.find(item=>item.item==='Bottle').added,10);
      assert.equal(live.inventory.find(item=>item.item==='Bottle').remaining,closingBottle+10);
      assert.ok(live.runs.some(run=>run.id===closedId && run.status==='closed'));
    });
    await check('stock near a reset uses actual run boundary time rather than the transaction start clock',async()=>{
      const before=await rpc('tdqsys_dashboard_snapshot',[A,null]),old=before.run.id;
      await db.exec('begin');
      try {
        await db.query('select pg_sleep(0.01)');
        await rpc('tdqsys_add_giveaway_stock',[A,'Bottle',1,'replenishment',randomUUID()]);
        await db.query('select pg_sleep(0.01)');
        const opened=await rpc('tdqsys_open_queue_run',[A,today,'Boundary test','tester']);
        const historical=await rpc('tdqsys_dashboard_snapshot',[A,old]);
        assert.equal(historical.inventory.find(item=>item.item==='Bottle').remaining,before.inventory.find(item=>item.item==='Bottle').remaining+1);
        const closing=(await db.query('select closed_at from queue_runs where id=$1',[old])).rows[0].closed_at;
        assert.ok(new Date(opened.opened_at).getTime()>=new Date(closing).getTime());
      } finally {await db.exec('rollback');}
    });
    await check('multi-item upgrade retains legacy selections without deducting their stock again',async()=>{
      const before=await rpc('tdqsys_inventory_snapshot',[A,null]);
      await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611060003_multi_item_giveaways.sql'),'utf8'));
      assert.deepEqual(await rpc('tdqsys_inventory_snapshot',[A,null]),before);
      const legacy=(await db.query('select id,giveaway_item from registrations where instance_id=$1 and giveaway_item is not null',[A])).rows;
      for(const row of legacy)assert.equal((await db.query('select item from registration_giveaways where registration_id=$1',[row.id])).rows[0].item,row.giveaway_item);
      for(const role of ['anon','authenticated']) {
        assert.equal((await db.query("select has_function_privilege($1,'public.tdqsys_issue_giveaways(text,uuid,jsonb,uuid)','execute') as allowed",[role])).rows[0].allowed,false);
        assert.equal((await db.query("select has_table_privilege($1,'public.registration_giveaways','select') as allowed",[role])).rows[0].allowed,false);
      }
    });
    await check('multi-item issuance is one-per-item, batch atomic, location scoped and replay safe',async()=>{
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify(['Bottle','Sticker','Single','Ribbon']),JSON.stringify([{item:'Ribbon',quantity:1,requestId:randomUUID()}])]);
      await rpc('tdqsys_add_giveaway_stock',[A,'Sticker',2,'replenishment',randomUUID()]);
      const id=(await db.query("select id from registrations where instance_id=$1 and idempotency_key='inventory-dashboard-registration'",[A])).rows[0].id;
      const raw=(await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[id])).rows[0].payload_snapshot;
      const request=randomUUID(),before=await rpc('tdqsys_inventory_snapshot',[A,null]);
      const issued=await rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Sticker','Bottle']),request]);
      assert.deepEqual(issued.giveawayClaims,['Bottle','Sticker']);
      const after=await rpc('tdqsys_inventory_snapshot',[A,null]);
      for(const name of ['Bottle','Sticker'])assert.equal(after.find(row=>row.item===name).remaining,before.find(row=>row.item===name).remaining-1);
      assert.equal((await rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Bottle','Sticker']),request])).replayed,true);
      assert.deepEqual(await rpc('tdqsys_inventory_snapshot',[A,null]),after);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Bottle','Ribbon']),randomUUID()]),/already issued/);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Ribbon','ribbon']),randomUUID()]),/only once/);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[B,id,JSON.stringify(['Ribbon']),randomUUID()]),/not found for this location/);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Ribbon']),request]),/different values/);
      assert.equal((await rpc('tdqsys_inventory_snapshot',[A,null])).find(row=>row.item==='Ribbon').remaining,1);
      const other=(await db.query('select id from registrations where instance_id=$1 and giveaway_item is null and id<>$2 limit 1',[A,id])).rows[0].id;
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,other,JSON.stringify(['Bottle','Single']),randomUUID()]),/out of stock/);
      assert.equal((await db.query('select count(*)::int n from registration_giveaways where registration_id=$1',[other])).rows[0].n,0);
      assert.deepEqual(await rpc('tdqsys_inventory_snapshot',[A,null]),after);
      await assert.rejects(rpc('tdqsys_set_giveaway',[A,id,null,'Bottle']),/locked/);
      await rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Ribbon']),randomUUID()]);
      const snapshot=await rpc('tdqsys_giveaway_snapshot',[A]);assert.equal(snapshot.registrations.find(row=>row.registrationId===id).giveawayClaims.length,3);
      assert.equal(snapshot.inventory.find(row=>row.item==='Ribbon').remaining,0);
      assert.deepEqual((await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[id])).rows[0].payload_snapshot,raw);
      const closed=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      const given=(await rpc('tdqsys_dashboard_snapshot',[A,closed])).given;
      await rpc('tdqsys_open_queue_run',[A,today,'Multi item history test','tester']);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Bottle']),randomUUID()]),/already issued/);
      assert.equal((await rpc('tdqsys_dashboard_snapshot',[A,closed])).given,given);
    });
    await check('new-run giveaway reset preserves old history but starts stock, claims and eligibility at zero',async()=>{
      const stockBefore=await rpc('tdqsys_inventory_snapshot',[A,null]);
      await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611060004_run_scoped_giveaways.sql'),'utf8'));
      assert.deepEqual(await rpc('tdqsys_inventory_snapshot',[A,null]),stockBefore,'Migration must not itself reset live stock');
      const old=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      const id=(await db.query("select id from registrations where instance_id=$1 and idempotency_key='inventory-dashboard-registration'",[A])).rows[0].id;
      const next=await rpc('tdqsys_open_queue_run',[A,today,'Giveaway reset test','tester']);assert.equal(next.giveaway_reset,true);
      const inventory=await rpc('tdqsys_inventory_snapshot',[A,null]);assert.ok(inventory.every(item=>item.remaining===0 && item.supplied===0 && item.initialized===false));
      const page=await rpc('tdqsys_giveaway_snapshot',[A]);assert.equal(page.runId,next.id);assert.deepEqual(page.registrations.find(row=>row.registrationId===id).giveawayClaims,[]);
      const historical=await rpc('tdqsys_dashboard_snapshot',[A,old]);assert.ok(historical.inventory.some(item=>item.supplied>0));
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify(['Bottle','Sticker']),JSON.stringify([{item:'Bottle',quantity:999,requestId:randomUUID(),runId:old}])]);
      assert.equal((await rpc('tdqsys_inventory_snapshot',[A,null])).find(item=>item.item==='Bottle').supplied,0,'Old saved Settings cannot refill a reset run');
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify(['Bottle','Sticker']),JSON.stringify([{item:'Bottle',quantity:2,requestId:randomUUID(),runId:next.id}])]);
      await assert.rejects(rpc('tdqsys_add_giveaway_stock',[A,'Bottle',1,'replenishment',randomUUID(),old]),/queue run changed/);
      await assert.rejects(rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Bottle']),randomUUID(),old]),/queue run changed/);
      const issued=await rpc('tdqsys_issue_giveaways',[A,id,JSON.stringify(['Bottle']),randomUUID(),next.id]);assert.deepEqual(issued.giveawayClaims,['Bottle']);
      assert.equal((await rpc('tdqsys_inventory_snapshot',[A,null])).find(item=>item.item==='Bottle').remaining,1);
      assert.equal((await rpc('tdqsys_dashboard_snapshot',[A,null])).inventory.find(item=>item.item==='Bottle').beginning,0);
    });
    await check('daily rollover opens a zero-stock giveaway scope and keeps all prior runs',async()=>{
      const previous=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      await db.query("update queue_runs set operating_day=(now() at time zone 'Asia/Manila')::date-1 where id=$1",[previous]);
      const next=await rpc('tdqsys_ensure_daily_run',[A]);assert.notEqual(next,previous);
      const inventory=await rpc('tdqsys_inventory_snapshot',[A,null]);assert.ok(inventory.every(item=>item.supplied===0 && item.remaining===0));
      const snapshot=await rpc('tdqsys_giveaway_snapshot',[A]);assert.ok(snapshot.registrations.every(row=>row.giveawayClaims.length===0));
      assert.ok((await rpc('tdqsys_dashboard_snapshot',[A,null])).runs.some(run=>run.id===previous));
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611060005_history_cleanup.sql'),'utf8'));
    await check('cleanup preview rejects foreign/active runs and deletion refuses missing confirmation or stale backup',async()=>{
      for(const role of ['anon','authenticated'])for(const fn of ['tdqsys_event_backup(text)','tdqsys_cleanup_preview(text,text,uuid[])','tdqsys_cleanup_apply(text,text,uuid[],text,text,uuid)'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,'public.'+fn,'execute'])).rows[0].allowed,false);
      const current=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      await assert.rejects(rpc('tdqsys_cleanup_preview',[A,'selected',[current]]),/only closed runs/);
      await assert.rejects(rpc('tdqsys_cleanup_preview',[B,'selected',[current]]),/only closed runs/);
      const p=await rpc('tdqsys_cleanup_preview',[A,'clean',[]]);assert.ok(p.backup.tables.registrations.length>0);
      await assert.rejects(rpc('tdqsys_cleanup_apply',[A,'clean',[],p.fingerprint,'wrong',randomUUID()]),/exact cleanup confirmation/);
      await assert.rejects(rpc('tdqsys_cleanup_apply',[A,'clean',[],'0'.repeat(64),'CLEAN SLATE',randomUUID()]),/data changed since backup/);
      await db.query('update test_drive_settings set updated_at=clock_timestamp() where instance_id=$1',[A]);
      await assert.rejects(rpc('tdqsys_cleanup_apply',[A,'clean',[],p.fingerprint,'CLEAN SLATE',randomUUID()]),/data changed since backup/);
      assert.equal((await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id,current);
    });
    await check('selected test-run deletion removes only its orphan data, preserves active run and replays safely',async()=>{
      const otherBefore=await rpc('tdqsys_event_backup',[B]);
      const current=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      const submit=args('cleanup-selected-client');submit[8]=hash('4567');const registration=await rpc('tdqsys_submit_registration',submit);
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify(['Bottle']),JSON.stringify([{item:'Bottle',quantity:2,requestId:randomUUID(),runId:current}])]);
      await rpc('tdqsys_issue_giveaways',[A,registration.registrationId,JSON.stringify(['Bottle']),randomUUID(),current]);
      const fresh=await rpc('tdqsys_open_queue_run',[A,today,'After selected test','tester']);
      const p=await rpc('tdqsys_cleanup_preview',[A,'selected',[current]]);assert.equal(p.summary.registrations,1);assert.equal(p.summary.tickets,2);
      const request=randomUUID();const result=await rpc('tdqsys_cleanup_apply',[A,'selected',[current],p.fingerprint,p.confirmation,request]);assert.equal(result.deleted,true);
      assert.equal((await db.query('select count(*)::int n from registrations where id=$1',[registration.registrationId])).rows[0].n,0);
      assert.equal((await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id,fresh.id);
      assert.deepEqual(await rpc('tdqsys_event_backup',[B]),otherBefore);
      assert.equal((await rpc('tdqsys_cleanup_apply',[A,'selected',[current],p.fingerprint,p.confirmation,request])).replayed,true);
    });
    await check('cleanup preserves a shared registration and its new-run ticket while removing old test tickets',async()=>{
      const run=(await rpc('tdqsys_dashboard_snapshot',[A,null])).run.id;
      const submit=args('cleanup-shared-client');submit[8]=hash('4567');const original=await rpc('tdqsys_submit_registration',submit);
      await rpc('tdqsys_open_queue_run',[A,today,'Keep shared client','tester']);
      const reissued=await rpc('tdqsys_reissue_ticket',[A,original.entries[0].entryId,null,false]);assert.ok(reissued.entryId);
      const p=await rpc('tdqsys_cleanup_preview',[A,'selected',[run]]);assert.equal(p.summary.registrations,0);
      await rpc('tdqsys_cleanup_apply',[A,'selected',[run],p.fingerprint,p.confirmation,randomUUID()]);
      assert.equal((await db.query('select count(*)::int n from registrations where id=$1',[original.registrationId])).rows[0].n,1);
      assert.equal((await db.query('select replaced_entry_id from test_drive_entries where id=$1',[reissued.entryId])).rows[0].replaced_entry_id,null);
    });
    await check('clean slate clears operating history, keeps configuration/other locations and reserves old codes',async()=>{
      await db.query('update test_drive_settings set dealerships=$2 where instance_id=$1',[A,JSON.stringify(['Toyota'])]);
      const p=await rpc('tdqsys_cleanup_preview',[A,'clean',[]]),other=await rpc('tdqsys_event_backup',[B]);
      const oldHash=(await db.query('select code_hash from se_daily_checkins where instance_id=$1 limit 1',[A])).rows[0].code_hash;
      await db.exec('begin');
      try {
        const result=await rpc('tdqsys_cleanup_apply',[A,'clean',[],p.fingerprint,p.confirmation,randomUUID()]);assert.ok(result.newRunId);
        const after=await rpc('tdqsys_event_backup',[A]);
        for(const table of ['registrations','test_drive_entries','sales_executives','se_daily_checkins','print_jobs','sheet_sync_jobs','giveaway_stock_events','giveaway_claim_events','registration_giveaways','giveaway_issue_requests'])assert.equal(after.tables[table].length,0,table);
        assert.equal(after.tables.queue_runs.length,1);assert.equal(after.tables.queue_runs[0].run_number,1);assert.equal(after.tables.queue_runs[0].giveaway_reset,true);
        assert.deepEqual(after.tables.vehicle_models,p.backup.tables.vehicle_models);assert.deepEqual(after.tables.test_drive_settings,p.backup.tables.test_drive_settings);
        assert.deepEqual(await rpc('tdqsys_event_backup',[B]),other);
        await db.exec('savepoint reserved_code');
        await assert.rejects(rpc('tdqsys_register_se_checkin',[A,'Fresh','Toyota',today,oldHash,'cipher','2099-11-02T00:00:00Z']),/reserved/);
        await db.exec('rollback to savepoint reserved_code');
      } finally {await db.exec('rollback');}
      assert.deepEqual((await rpc('tdqsys_cleanup_preview',[A,'clean',[]])).backup,p.backup,'Rollback restores the exported dataset exactly');
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611060006_registration_contacts.sql'),'utf8'));
    await check('SE contacts persist as eleven-digit strings; invalid SE/client submissions are atomic and legacy data stays intact',async()=>{
      const before=await rpc('tdqsys_event_backup',[A]);
      await db.query('update test_drive_settings set dealerships=$2 where instance_id=$1',[A,JSON.stringify(['Toyota'])]);
      const seArgs=[A,'Contact Test','Toyota',today,hash('8765'),'cipher','2099-11-02T00:00:00Z'];
      const id=await rpc('tdqsys_register_se_checkin',[...seArgs,'00171234567']);
      for(const value of [null,'','0917123456','091712345678','0917-1234567','+639171234567','09171234567\n']) {
        await assert.rejects(rpc('tdqsys_register_se_checkin',[...seArgs,value]),/exactly 11 digits/);
        const bad=args('invalid-contact-'+String(value));bad[5]=value;bad[8]=hash('8765');
        await assert.rejects(rpc('tdqsys_submit_registration',bad),/exactly 11 digits/);
      }
      assert.equal((await db.query('select contact_number from sales_executives where id=(select sales_executive_id from se_daily_checkins where id=$1)',[id])).rows[0].contact_number,'00171234567');
      const after=await rpc('tdqsys_event_backup',[A]);assert.deepEqual(after.tables.registrations,before.tables.registrations);
      const privileges=(await db.query("select has_function_privilege('anon','tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz,text)','execute') a,has_function_privilege('authenticated','tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz,text)','execute') b")).rows[0];
      assert.equal(privileges.a,false);assert.equal(privileges.b,false);
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611070001_private_rpc_permissions.sql'),'utf8'));
    await check('all TDQSYS RPC overloads deny browser execution while retaining service access',async()=>{
      const functions=(await db.query("select p.oid::regprocedure::text name,has_function_privilege('anon',p.oid,'execute') a,has_function_privilege('authenticated',p.oid,'execute') b,has_function_privilege('service_role',p.oid,'execute') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'tdqsys_%'")).rows;
      assert.ok(functions.length>25);
      for(const fn of functions){assert.equal(fn.a,false,fn.name);assert.equal(fn.b,false,fn.name);assert.equal(fn.s,true,fn.name);}
      await db.exec('set role anon');
      await assert.rejects(rpc('tdqsys_open_queue_run',[A,today,'forbidden','browser']),/permission denied/);
      await db.exec('reset role');
      await db.exec('create function public.tdqsys_future_permission_probe() returns integer language sql as $$select 1$$');
      assert.equal((await db.query("select has_function_privilege('anon','tdqsys_future_permission_probe()','execute') a")).rows[0].a,false);
      assert.ok((await rpc('tdqsys_public_registration_config',[A])).models.length>0);
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611080001_agent_ui_wording.sql'),'utf8'));
    await check('Agent wording updates database messages without restoring public RPC access',async()=>{
      const result=await rpc('tdqsys_validate_se_code',[A,hash('not-issued'),'copy-check']);
      assert.match(result.error,/Agent code/);assert.doesNotMatch(result.error,/Sales Executive|\bSE\b/);
      const exposed=(await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'tdqsys_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))")).rows[0].n;
      assert.equal(exposed,0);
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611080002_optional_registration_statements.sql'),'utf8'));
    await check('blank statements configure and register with hashed empty snapshots; stale versions still fail',async()=>{
      await db.exec('begin');
      try {
        for(const [waiver,terms] of [['',''],['Waiver',''],['','Terms']]){
          await rpc('tdqsys_configure_registration',[A,JSON.stringify(models),waiver,terms,'',JSON.stringify(['Toyota'])]);
          const config=await rpc('tdqsys_public_registration_config',[A]);
          assert.equal(config.waiverStatement,waiver);assert.equal(config.termsAndConditions,terms);
          assert.equal(config.waiverVersion,hash(waiver));assert.equal(config.termsVersion,hash(terms));
          const values=args(randomUUID());values[8]=hash('8765');values[9]=hash(waiver);values[10]=hash(terms);
          const result=await rpc('tdqsys_submit_registration',values);
          const saved=(await db.query('select waiver_snapshot,terms_snapshot from registrations where id=$1',[result.registrationId])).rows[0];
          assert.equal(saved.waiver_snapshot,waiver);assert.equal(saved.terms_snapshot,terms);
        }
        await db.exec('savepoint stale_consent');
        const stale=args(randomUUID());stale[8]=hash('8765');
        await assert.rejects(rpc('tdqsys_submit_registration',stale),/consent text changed/);
        await db.exec('rollback to savepoint stale_consent');
      }finally{await db.exec('rollback');}
    });
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611090001_giveaway_corrections.sql'),'utf8'));
    await db.exec('begin');
    try {
      const correctionRun=await rpc('tdqsys_ensure_daily_run',[A]);
      const client=(await db.query('select id from registrations where instance_id=$1 limit 1',[A])).rows[0].id;
      const rawSheet=(await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[client])).rows;
      const cap='Correction Cap',mug='Correction Mug',empty='Correction Empty';
      await rpc('tdqsys_configure_inventory',[A,JSON.stringify([cap,mug,empty]),JSON.stringify([{item:cap,quantity:10,requestId:randomUUID(),runId:correctionRun},{item:mug,quantity:2,requestId:randomUUID(),runId:correctionRun},{item:empty,quantity:0,requestId:randomUUID(),runId:correctionRun}])]);
      const correct=(kind,target,before,after,id=randomUUID(),location=A,runId=correctionRun,reason='Verified recording error',operator='Test facilitator')=>rpc('tdqsys_correct_giveaway',[location,kind,target,JSON.stringify(before),JSON.stringify(after),reason,operator,id,runId]);
      const stock=async item=>(await rpc('tdqsys_inventory_snapshot',[A,null])).find(row=>row.item===item);
      const denied=async(fn,pattern)=>{await db.exec('savepoint rejected_correction');await assert.rejects(fn(),pattern);await db.exec('rollback to savepoint rejected_correction');};
      await rpc('tdqsys_issue_giveaways',[A,client,JSON.stringify([cap]),randomUUID(),correctionRun]);
      await check('audited item corrections add replacements and return removed stock exactly once',async()=>{
        await correct('claims',client,[cap],[cap,mug]);assert.equal((await stock(mug)).remaining,1);
        const id=randomUUID(),result=await correct('claims',client,[cap,mug],[mug],id);
        assert.equal((await stock(cap)).remaining,10);
        assert.equal((await correct('claims',client,[cap,mug],[mug],id)).replayed,true);
        assert.equal((await stock(cap)).remaining,10);
        await denied(()=>correct('claims',client,[cap,mug],[],id),/request ID/);
        await correct('claims',client,[mug],[]);assert.equal((await stock(mug)).remaining,2);
        await rpc('tdqsys_issue_giveaways',[A,client,JSON.stringify([mug]),randomUUID(),correctionRun]);assert.equal((await stock(mug)).remaining,1);
        assert.equal(result.saved,true);
      });
      await check('corrections reject stale, cross-location, invalid, unstocked and no-op requests atomically',async()=>{
        const before=await rpc('tdqsys_event_backup',[A]);
        await denied(()=>correct('claims',client,[mug],[empty]),/out of stock/);
        await denied(()=>correct('claims',client,[cap],[]),/selection changed/);
        await denied(()=>correct('claims',client,[mug],[],randomUUID(),B),/run changed|read-only|registration not found/);
        await denied(()=>correct('claims',client,[mug],[],randomUUID(),A,randomUUID()),/run changed/);
        await denied(()=>correct('claims',client,[mug],[mug,mug]),/each item once/);
        await denied(()=>correct('claims',client,[mug],[mug]),/no giveaway correction/);
        await denied(()=>correct('claims',client,[mug],[],randomUUID(),A,correctionRun,''),/reason/);
        await denied(()=>correct('claims',client,[mug],[],randomUUID(),A,correctionRun,'Valid reason',''),/operator/);
        assert.deepEqual(await rpc('tdqsys_event_backup',[A]),before);
      });
      await check('beginning balance correction preserves replenishments, prevents negative stock and safely retries',async()=>{
        const id=randomUUID();await correct('opening',cap,10,8,id);
        assert.equal((await stock(cap)).opening,8);assert.equal((await stock(cap)).remaining,8);
        assert.equal((await correct('opening',cap,10,8,id)).replayed,true);
        await denied(()=>correct('opening',cap,10,9),/balance changed/);
        await denied(()=>correct('opening',mug,2,0),/negative/);
        await rpc('tdqsys_add_giveaway_stock',[A,mug,2,'replenishment',randomUUID(),correctionRun]);
        await correct('opening',mug,2,0);assert.equal((await stock(mug)).supplied,2);assert.equal((await stock(mug)).remaining,1);
        await denied(()=>correct('opening',cap,8,-1),/whole number/);
      });
      await check('correction audit retains operator, reason, before/after and backup data without changing raw Sheets',async()=>{
        const history=await rpc('tdqsys_giveaway_correction_history',[A,correctionRun,'opening',cap]);
        assert.equal(history.history[0].actor_id,'Test facilitator');assert.equal(history.history[0].details.result.before,10);assert.equal(history.history[0].details.result.after,8);
        assert.equal(history.history[0].details.request.reason,'Verified recording error');
        assert.equal((await rpc('tdqsys_giveaway_correction_history',[B,correctionRun,'opening',cap])).history.length,0);
        const backup=await rpc('tdqsys_event_backup',[A]);assert.ok(backup.tables.audit_log.some(row=>row.action==='giveaway-correction'));
        assert.deepEqual((await db.query('select payload_snapshot from sheet_sync_jobs where registration_id=$1',[client])).rows,rawSheet);
        const dash=await rpc('tdqsys_dashboard_snapshot',[A,correctionRun]);assert.equal(dash.inventory.find(row=>row.item===mug).remaining,1);
      });
      await check('closed-run correction attempts are blocked and browser roles cannot call correction RPCs',async()=>{
        await rpc('tdqsys_open_queue_run',[A,today,'New correction test run','facilitator']);
        await denied(()=>correct('opening',cap,8,9),/run changed/);
        for(const role of ['anon','authenticated'])for(const name of ['tdqsys_correct_giveaway(text,text,text,jsonb,jsonb,text,text,uuid,uuid)','tdqsys_giveaway_correction_history(text,uuid,text,text)'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,name])).rows[0].allowed,false);
      });
    }finally{await db.exec('rollback');}
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611090002_registration_simulation.sql'),'utf8'));
    await db.exec('begin');
    try {
      const location='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      await rpc('tdqsys_configure_registration',[location,JSON.stringify(models),'Waiver','Terms','',JSON.stringify(['Dealer'])]);
      const run=(await rpc('tdqsys_open_simulation_run',[location])).runId;
      const model=(await db.query('select id from vehicle_models where instance_id=$1 limit 1',[location])).rows[0].id;
      const agent={p_instance_id:location,p_name:'TEST Agent Trial',p_dealership:'Dealer',p_contact_number:'00000000001',p_operating_day:today,p_code_hash:hash('1234'),p_code_ciphertext:'encrypted-test-code',p_expires_at:'2099-01-01T00:00:00Z'};
      const client={p_instance_id:location,p_full_name:'TEST Client Trial',p_name_search:'test client trial',p_email:'trial@example.invalid',p_city_address:'TEST City',p_contact_number:'00000000001',p_code_hash:hash('1234'),p_waiver_version:hash('Waiver'),p_terms_version:hash('Terms'),p_idempotency_key:'simulation-test-client',p_model_ids:[model]};
      const submit=(kind,data,runId=run)=>rpc('tdqsys_simulation_registration',[location,runId,kind,JSON.stringify(data)]);
      const denied=async(fn,pattern)=>{await db.exec('savepoint rejected_simulation');await assert.rejects(fn(),pattern);await db.exec('rollback to savepoint rejected_simulation');};
      await check('scoped simulation uses normal Agent/client registration and produces real test-run tickets and jobs',async()=>{
        await submit('agent',agent);const result=await submit('client',client);
        assert.equal((await db.query('select queue_run_id from test_drive_entries where registration_id=$1',[result.registrationId])).rows[0].queue_run_id,run);
        assert.equal((await db.query('select count(*)::int n from sheet_sync_jobs where registration_id=$1',[result.registrationId])).rows[0].n,1);
        assert.equal((await db.query("select count(*)::int n from print_jobs where instance_id=$1",[location])).rows[0].n,2);
        assert.deepEqual(await submit('client',client),result);
      });
      await check('simulation cannot replace a populated run, cross locations, use real names or write after official reset',async()=>{
        await denied(()=>rpc('tdqsys_open_simulation_run',[location]),/not empty/);
        await denied(()=>submit('agent',{...agent,p_name:'Real Agent'}),/invalid simulation/);
        await denied(()=>submit('client',{...client,p_instance_id:A}),/location mismatch/);
        const official=(await rpc('tdqsys_open_queue_run',[location,today,'Official run','staff'])).id;
        await denied(()=>submit('client',{...client,p_idempotency_key:'after-reset'}),/simulation run changed/);
        await denied(()=>submit('agent',agent,official),/simulation run changed/);
        assert.equal((await db.query('select count(*)::int n from test_drive_entries where queue_run_id=$1',[official])).rows[0].n,0);
        await rpc('tdqsys_configure_inventory',[location,JSON.stringify(['Cap']),JSON.stringify([{item:'Cap',quantity:1,runId:official,requestId:randomUUID()}])]);
        await denied(()=>rpc('tdqsys_open_simulation_run',[location]),/not empty/);
        for(const role of ['anon','authenticated'])for(const name of ['tdqsys_open_simulation_run(text)','tdqsys_simulation_registration(text,uuid,text,jsonb)'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') allowed",[role,name])).rows[0].allowed,false);
      });
    }finally{await db.exec('rollback');}
    console.log(`${count} PostgreSQL integration checks passed.`);
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
