'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const INSTANCE = '11111111-2222-4333-8444-555555555555';
const WRITER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

async function runEdge(body, records = {}, environment = {}) {
  let handler;
  const calls = [];
  const defaults = {
    tdqsys_queue_writers: { token_hash: createHash('sha256').update(WRITER).digest('hex') },
    revoked_licenses: null,
    test_drive_entries: null
  };
  const admin = {
    from(table) {
      const filters = [];
      const result = () => ({ data: Object.hasOwn(records, table) ? records[table] : defaults[table], error: null });
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        is(key, value) { filters.push([key,value]); return query; },
        in() { return query; },
        order() { calls.push({table,filters}); return Promise.resolve(result()); },
        maybeSingle() { calls.push({ table, filters }); return Promise.resolve(result()); }
      };
      return query;
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: { id: 'entry' }, error: null }; }
  };
  const source = fs.readFileSync(path.join(ROOT, 'supabase/functions/test-drive-operations/index.ts'), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/: string/g, '').replace(/\)!/g, ')').replace(/\(e as Error\)/g, 'e');
  const codes = fs.readFileSync(path.join(ROOT,'supabase/functions/_shared/se-codes.js'),'utf8').replace(/export /g,'');
  vm.runInNewContext(codes+'\n'+source, { createClient: () => admin, Response, TextEncoder, TextDecoder, atob, Uint8Array, crypto: webcrypto,
    Deno: { env: { get: key => environment[key] || (key.startsWith('SUPABASE') ? 'test' : undefined) }, serve: fn => { handler = fn; } } });
  const response = await handler(new Request('https://example.test/functions/v1/test-drive-operations', {
    method: 'POST', headers: { 'x-tdqsys-instance': INSTANCE, 'x-tdqsys-writer': WRITER, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { response, calls };
}

test('private Settings configuration sends dealerships atomically and old clients preserve the saved list',async()=>{
  const current=await runEdge({action:'configure',models:[],waiver:'waiver',terms:'terms',dealerships:['Toyota North']});
  assert.equal(current.calls.find(call=>call.rpc)?.rpc,'tdqsys_configure_registration');
  assert.deepEqual(Array.from(current.calls.find(call=>call.rpc).args.p_dealerships),['Toyota North']);
  const legacy=await runEdge({action:'configure',models:[],waiver:'waiver',terms:'terms'});
  assert.equal(legacy.calls.find(call=>call.rpc)?.rpc,'tdqsys_configure_test_drive');
});

test('giveaway APIs use authenticated location identity and RPCs; malformed selection is refused',async()=>{
  const snapshot=await runEdge({action:'giveaway-snapshot',instanceId:'foreign'});
  assert.equal(snapshot.response.status,200);
  assert.equal(snapshot.calls.filter(call=>call.rpc).at(-1).rpc,'tdqsys_giveaway_snapshot');
  assert.equal(snapshot.calls.find(call=>call.rpc).args.p_instance_id,INSTANCE);
  const claim=await runEdge({action:'set-giveaway',registrationId:WRITER,item:'Cap',expectedItem:null});
  assert.equal(claim.response.status,200);assert.equal(claim.calls.find(call=>call.rpc).rpc,'tdqsys_set_giveaway');
  assert.equal(claim.calls.find(call=>call.rpc).args.p_expected_item,null);
  const invalid=await runEdge({action:'set-giveaway',registrationId:'bad',item:'Cap'});
  assert.equal(invalid.response.status,400);assert.equal(invalid.calls.some(call=>call.rpc),false);
  const configured=await runEdge({action:'configure',models:[],waiver:'w',terms:'t',giveawayItems:['Cap']});
  assert.equal(configured.calls.at(-1).rpc,'tdqsys_configure_giveaways');
  assert.deepEqual(Array.from(configured.calls.at(-1).args.p_items),['Cap']);
});

test('stock and analytics endpoints bind ownership, validate quantities and keep opening setup retryable',async()=>{
  const result=await runEdge({action:'giveaway-stock',item:'Cap',quantity:3,requestId:WRITER,runId:WRITER,instanceId:'foreign'});
  const call=result.calls.find(call=>call.rpc);assert.equal(call.rpc,'tdqsys_add_giveaway_stock');
  assert.equal(call.args.p_instance_id,INSTANCE);assert.equal(call.args.p_kind,'replenishment');assert.equal(call.args.p_request_id,WRITER);
  for(const quantity of [-1,0,1.5,'3',100000001])assert.equal((await runEdge({action:'giveaway-stock',item:'Cap',quantity,requestId:WRITER})).response.status,400);
  const dashboard=await runEdge({action:'dashboard-snapshot',runId:WRITER});
  assert.equal(dashboard.calls.find(call=>call.rpc).rpc,'tdqsys_dashboard_snapshot');assert.equal(dashboard.calls.find(call=>call.rpc).args.p_run_id,WRITER);
  assert.equal((await runEdge({action:'dashboard-snapshot',runId:'bad'})).response.status,400);
  const inventory=await runEdge({action:'giveaway-inventory'});assert.equal(inventory.calls.filter(call=>call.rpc).at(-1).rpc,'tdqsys_giveaway_stock_history');
  const configured=await runEdge({action:'configure',models:[],waiver:'w',terms:'t',giveawayItems:['Cap'],giveawayStockOpenings:[{item:'Cap',quantity:10,requestId:WRITER}]});
  assert.equal(configured.calls.at(-1).rpc,'tdqsys_configure_inventory');assert.equal(configured.calls.at(-1).args.p_openings[0].quantity,10);
});

test('multi-item API validates distinct items and passes the authenticated owner and stable batch ID',async()=>{
  const body={action:'issue-giveaways',registrationId:WRITER,requestId:INSTANCE,runId:WRITER,items:['Cap','Tote'],instanceId:'foreign'};
  const result=await runEdge(body);assert.equal(result.response.status,200);
  const call=result.calls.find(call=>call.rpc);assert.equal(call.rpc,'tdqsys_issue_giveaways');assert.equal(call.args.p_instance_id,INSTANCE);assert.equal(call.args.p_request_id,INSTANCE);
  assert.deepEqual(Array.from(call.args.p_items),['Cap','Tote']);
  for(const items of [[],['Cap',' cap '],[''],[1],null])assert.equal((await runEdge({...body,items})).response.status,400);
});
test('offline replay uses authenticated ownership and passes the operation unchanged to its idempotent transaction',async()=>{
  const operation={id:'op',runId:'run',entryId:'entry',action:'ongoing'};
  const {response,calls}=await runEdge({action:'sync-local-operation',instanceId:'foreign',operation});
  assert.equal(response.status,200);const action=calls.find(call=>call.rpc);assert.equal(action.rpc,'tdqsys_apply_local_operation');
  assert.equal(action.args.p_instance_id,INSTANCE);assert.equal(action.args.p_operation.entryId,'entry');
});

test('operations refuses another location entry before invoking RPC', async () => {
  const { response, calls } = await runEdge({ action: 'ongoing', entryId: 'foreign-entry' });
  assert.equal(response.status, 404);
  assert.equal(calls.some(c => c.rpc), false);
  assert.ok(calls.find(c => c.table === 'test_drive_entries').filters.some(([k,v]) => k === 'instance_id' && v === INSTANCE));
});

test('operations refuses revoked and unknown writers', async () => {
  assert.equal((await runEdge({ action: 'reset' }, { revoked_licenses: { instance_id: INSTANCE } })).response.status, 403);
  assert.equal((await runEdge({ action: 'reset' }, { tdqsys_queue_writers: null })).response.status, 401);
});

test('status action passes authenticated instance to transaction', async () => {
  const { response, calls } = await runEdge({ action: 'status', entryId: 'owned', status: 'no_show' }, { test_drive_entries: { id: 'owned' } });
  assert.equal(response.status, 200);
  assert.equal(calls.find(c => c.rpc).args.p_instance_id, INSTANCE);
});

test('desktop IPC rejects remote renderer before reading credentials', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  const snippet = source.slice(source.indexOf("ipcMain.handle('af:testDrive'"), source.indexOf("ipcMain.handle('af:chooseVideos'"));
  let handler; let read = false;
  vm.runInNewContext(snippet, { ipcMain: { handle: (_name, fn) => { handler = fn; } }, URL, PORT: 80,
    fs: { readFileSync: () => { read = true; throw Error('must not read'); } } });
  const result = await handler({ senderFrame: { url: 'https://attacker.example/test-drive-operations.html' } }, { action: 'snapshot' });
  assert.equal(result.ok, false);
  assert.equal(read, false);
});

test('integration information returns the sharing email without revealing the Google key', async () => {
  const { response } = await runEdge({ action: 'integration-info' }, {}, {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sheets@example.iam.gserviceaccount.com', private_key: 'must-remain-server-side' })
  });
  const result = await response.json();
  assert.equal(result.serviceAccountEmail, 'sheets@example.iam.gserviceaccount.com');
  assert.equal(JSON.stringify(result).includes('must-remain-server-side'), false);
  assert.equal(Object.hasOwn(result, 'private_key'), false);
});

test('Settings renderer cannot call facilitator actions through its connection-check bridge', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/main.js'), 'utf8');
  const snippet = source.slice(source.indexOf("ipcMain.handle('af:testDrive'"), source.indexOf("ipcMain.handle('af:chooseVideos'"));
  let handler; let read = false;
  vm.runInNewContext(snippet, { ipcMain: { handle: (_name, fn) => { handler = fn; } }, URL, PORT: 80,
    fs: { readFileSync: () => { read = true; throw Error('must not read'); } } });
  const result = await handler({ senderFrame: { url: 'http://localhost:80/settings.html' } }, { action: 'reset' });
  assert.equal(result.ok, false); assert.equal(read, false);
});

test('private snapshots expose active SE codes only on requested staff views and never return ciphertext',async()=>{
  const raw=webcrypto.getRandomValues(new Uint8Array(32)),iv=webcrypto.getRandomValues(new Uint8Array(12));
  const key=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
  const encrypted=new Uint8Array(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('0042')));
  const ciphertext=Buffer.concat([Buffer.from(iv),Buffer.from(encrypted)]).toString('base64');
  const environment={TEST_DRIVE_CODE_ENCRYPTION_KEY:Buffer.from(raw).toString('base64')};
  function records(){return {queue_runs:{id:'run',operating_day:'2026-11-01'},vehicle_models:[],test_drive_entries:[],display_state:null,
    print_jobs:[{id:'slip',kind:'se_code_slip',se_daily_checkins:{expires_at:'2099-11-02T00:00:00Z',code_ciphertext:ciphertext,sales_executives:{name:'Test SE'}}}],
    se_daily_checkins:[{id:'se',operating_day:'2026-11-01',expires_at:'2099-11-02T00:00:00Z',code_ciphertext:ciphertext,sales_executives:{name:'Test SE',dealership:'Test Dealer'}},
      {id:'expired',operating_day:'2020-01-01',expires_at:'2020-01-02T00:00:00Z',code_ciphertext:'expired-code-is-never-decrypted',sales_executives:{name:'Old SE',dealership:'Old Dealer'}}]};}
  const normal=await(await runEdge({action:'snapshot'},records(),environment)).response.json();
  assert.equal(normal.printJobs[0].seCode,undefined);assert.equal(JSON.stringify(normal).includes('code_ciphertext'),false);
  const {response,calls}=await runEdge({action:'snapshot',includePrintCodes:true,includeSalesExecutives:true},records(),environment);
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.printJobs[0].seCode,'0042');assert.equal(result.seCheckins[0].code,'0042');assert.equal(result.seCheckins[0].dealership,'Test Dealer');assert.equal(result.seCheckins[1].code,null);
  assert.equal(JSON.stringify(result).includes(ciphertext),false);
  const read=calls.find(call=>call.table==='se_daily_checkins');
  assert.ok(read.filters.some(([key,value])=>key==='instance_id'&&value===INSTANCE));
  assert.ok(read.filters.some(([key,value])=>key==='operating_day'&&value==='2026-11-01'));
  assert.ok(read.filters.some(([key,value])=>key==='revoked_at'&&value===null));
  const linked=records();linked.test_drive_entries=[{id:'entry',registrations:{full_name:'Test Client',se_daily_checkins:{code_ciphertext:ciphertext,sales_executives:{name:'Test SE'}}}}];
  const master=await(await runEdge({action:'snapshot',includeAgentCodes:true},linked,environment)).response.json();
  assert.equal(master.entries[0].agentName,'Test SE');assert.equal(master.entries[0].agentCode,'0042');assert.equal(JSON.stringify(master).includes('code_ciphertext'),false);
});

test('SE reprint always passes authenticated location ownership to its RPC',async()=>{
  const {response,calls}=await runEdge({action:'reprint-se-code',checkinId:'checkin'});
  assert.equal(response.status,200);const action=calls.find(c=>c.rpc);assert.equal(action.rpc,'tdqsys_reprint_se_code');assert.equal(action.args.p_instance_id,INSTANCE);
});

test('SE reset requires confirmation and supplies authenticated ownership to its transaction',async()=>{
  const denied=await runEdge({action:'reset-sales-executives',reason:'Testing'});
  assert.equal(denied.response.status,400);assert.equal(denied.calls.some(call=>call.rpc),false);
  const accepted=await runEdge({action:'reset-sales-executives',confirm:true,reason:' Testing '});
  assert.equal(accepted.response.status,200);
  const rpc=accepted.calls.find(call=>call.rpc);assert.equal(rpc.rpc,'tdqsys_reset_sales_executives');
  assert.equal(rpc.args.p_instance_id,INSTANCE);assert.equal(rpc.args.p_reason,'Testing');
});

test('correction bridge requires confirmation, reason and operator and supplies authenticated location',async()=>{
 const body={action:'giveaway-correct',kind:'claims',target:WRITER,runId:WRITER,requestId:WRITER,expected:['Cap'],value:[],operator:'Staff',reason:'Wrong item recorded',confirm:true};
 for(const invalid of [{confirm:false},{reason:''},{operator:''},{requestId:'bad'},{value:['Cap','cap']},{kind:'opening',expected:1,value:-1}]){
  const result=await runEdge({...body,...invalid});assert.equal(result.response.status,400);assert.equal(result.calls.some(call=>call.rpc),false);
 }
 const result=await runEdge({...body,instanceId:'other'});assert.equal(result.response.status,200);const call=result.calls.find(call=>call.rpc);assert.equal(call.rpc,'tdqsys_correct_giveaway');assert.equal(call.args.p_instance_id,INSTANCE);assert.deepEqual(Array.from(call.args.p_value),[]);
 const history=await runEdge({action:'giveaway-correction-history',kind:'opening',target:'Cap',runId:WRITER});assert.equal(history.calls.find(call=>call.rpc).rpc,'tdqsys_giveaway_correction_history');
});

test('simulation opening is confirmed and always scoped to the private writer location',async()=>{
 const denied=await runEdge({action:'simulation-open'});assert.equal(denied.response.status,400);assert.equal(denied.calls.some(call=>call.rpc),false);
 const allowed=await runEdge({action:'simulation-open',confirm:true,instanceId:'other'});assert.equal(allowed.response.status,200);const call=allowed.calls.find(call=>call.rpc);assert.equal(call.rpc,'tdqsys_open_simulation_run');assert.equal(call.args.p_instance_id,INSTANCE);
});
