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
