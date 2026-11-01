'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const helpers = require('../shared/test-drive');
const instanceId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const modelId = '11111111-2222-4333-8444-555555555555';
const body = { instanceId, fullName:'Ana Cruz',email:'ana@example.com',cityAddress:'Manila',contactNumber:'09170000000',
  modelIds:[modelId],seCode:'0123',waiverAccepted:true,termsAccepted:true,waiverVersion:'a'.repeat(64),termsVersion:'b'.repeat(64) };

async function invoke(file, payload, fetcher, key='request-00001') {
  const source=fs.readFileSync(path.join(__dirname,'../functions/api/test-drive',file),'utf8')
    .replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/,(_,names)=>`const {${names}}=helpers;`)
    .replace('export async function onRequest','async function onRequest');
  const sandbox={ helpers,Response,Request,URL,TextEncoder,crypto:webcrypto,fetch:fetcher };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return sandbox.onRequest({ request:new Request('https://test.example/api/test-drive/'+file,{method:'POST',
    headers:{'Content-Type':'application/json','Idempotency-Key':key,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(payload)}),
    env:{SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'server-only-test-key'} });
}

test('client endpoint rejects invalid consent versions before database access',async()=>{
  const response=await invoke('registrations.js',{...body,waiverVersion:'forged'},()=>{throw Error('must not fetch');});
  assert.equal(response.status,400);
});
test('client endpoint preserves optional blank answers and idempotency key',async()=>{
  let submitted;
  const response=await invoke('registrations.js',body,async(url,options)=>{
    if(url.endsWith('tdqsys_validate_se_code'))return Response.json({name:'SE',dealership:'Toyota'});
    submitted=JSON.parse(options.body);return Response.json({entries:[{modelId,queueNumber:1}]});
  });
  assert.equal(response.status,201);assert.equal(submitted.p_for_application,null);
  assert.equal(submitted.p_idempotency_key,'request-00001');assert.equal(submitted.p_instance_id,instanceId);
});
test('rate-limited SE validation cannot allocate a client ticket',async()=>{
  let calls=0;
  const response=await invoke('registrations.js',body,async()=>{calls++;return Response.json({error:'Wait one minute',limited:true});});
  assert.equal(response.status,429);assert.equal(calls,1);
});
test('code endpoint never accepts a truncated five-digit code',async()=>{
  const response=await invoke('se-code.js',{instanceId,code:'01234'},()=>{throw Error('must not fetch');});
  assert.equal(response.status,400);
});
