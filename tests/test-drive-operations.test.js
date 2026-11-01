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
        in() { return query; },
        order() { return Promise.resolve(result()); },
        maybeSingle() { calls.push({ table, filters }); return Promise.resolve(result()); }
      };
      return query;
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: { id: 'entry' }, error: null }; }
  };
  const source = fs.readFileSync(path.join(ROOT, 'supabase/functions/test-drive-operations/index.ts'), 'utf8')
    .replace(/^import .*;$/gm, '')
    .replace(/: string/g, '').replace(/\)!/g, ')').replace(/\(e as Error\)/g, 'e');
  vm.runInNewContext(source, { createClient: () => admin, Response, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: key => environment[key] || (key.startsWith('SUPABASE') ? 'test' : undefined) }, serve: fn => { handler = fn; } } });
  const response = await handler(new Request('https://example.test/functions/v1/test-drive-operations', {
    method: 'POST', headers: { 'x-tdqsys-instance': INSTANCE, 'x-tdqsys-writer': WRITER, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }));
  return { response, calls };
}

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
