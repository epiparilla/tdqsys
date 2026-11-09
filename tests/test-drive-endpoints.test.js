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
  modelIds:[modelId],seCode:'0123',privacyAccepted:true,waiverAccepted:true,printedWaiverAccepted:true,termsAccepted:true,waiverVersion:'a'.repeat(64),termsVersion:'b'.repeat(64) };

async function invoke(file, payload, fetcher, key='request-00001') {
  const source=fs.readFileSync(path.join(__dirname,'../functions/api/test-drive',file),'utf8')
    .replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/,(_,names)=>`const {${names}}=helpers;`)
    .replace('export async function onRequest','async function onRequest');
  const sandbox={ helpers,Response,Request,URL,TextEncoder,atob,btoa,crypto:webcrypto,fetch:fetcher };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return sandbox.onRequest({ request:new Request('https://test.example/api/test-drive/'+file,{method:'POST',
    headers:{'Content-Type':'application/json','Idempotency-Key':key,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(payload)}),
    env:{SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'server-only-test-key',TEST_DRIVE_CODE_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')} });
}

test('both registration endpoints reject invalid contact numbers before database access',async()=>{
  for(const contactNumber of [undefined,'','0917123456','091712345678','0917-1234567','+639171234567','0917123456a']) {
    for(const [file,payload] of [['se-checkins.js',{instanceId,name:'Ana Cruz',dealership:'Toyota North'}],['registrations.js',body]]) {
      const response=await invoke(file,{...payload,contactNumber},()=>{throw Error('must not fetch');});
      assert.equal(response.status,400);assert.match((await response.json()).fields.contactNumber,/11 digits/);
    }
  }
});
test('client endpoint requires explicit Data Privacy Consent before any database access',async()=>{
  for(const privacyAccepted of [undefined,false,null,'true',1]) {
    let calls=0;
    const response=await invoke('registrations.js',{...body,privacyAccepted},()=>{calls++;throw Error('must not fetch');});
    assert.equal(response.status,400);assert.equal(calls,0);
    assert.match((await response.json()).fields.privacyAccepted,/Data Privacy Consent/);
  }
});
test('first registration step contains the exact required unchecked privacy consent before client fields',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/test-drive-registration.html'),'utf8');
  const first=html.split('<section data-step="0">')[1].split('</section>')[0];
  assert.match(first,/DATA PRIVACY CONSENT/);
  assert.match(first,/<input type="checkbox" name="privacyAccepted" required>/);
  assert.match(first,/I agree to the collection and use of my information in accordance with the Data Privacy Act of 2012\./);
  assert.ok(first.indexOf('privacyAccepted')<first.indexOf('name="email"'));
  const js=fs.readFileSync(path.join(__dirname,'../public/test-drive-registration.js'),'utf8');
  assert.match(js,/privacyAccepted: field\('privacyAccepted'\).checked/);
  assert.match(js,/if \(!field\('privacyAccepted'\).checked\) \{ step = 0; show\(\); field\('privacyAccepted'\).reportValidity\(\); return; \}/);
});

test('both forms require the same 11-digit numeric contact field',()=>{
  for(const file of ['se-registration.html','test-drive-registration.html']) {
    const html=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
    const input=html.match(/<input name="contactNumber"[^>]+>/)[0];
    for(const attr of ['type="tel"','inputmode="numeric"','pattern="[0-9]{11}"','minlength="11"','maxlength="11"','required']) assert.ok(input.includes(attr),file+' '+attr);
  }
});

test('SE endpoint refuses an unlisted dealership before issuing any code',async()=>{
  let calls=0;
  const response=await invoke('se-checkins.js',{instanceId,name:'Ana Cruz',contactNumber:'09171234567',dealership:'Other location'},async()=>{calls++;return Response.json([{timezone:'Asia/Manila',dealerships:['Toyota North']}]);});
  assert.equal(response.status,400);assert.equal(calls,1);assert.match((await response.json()).error,/configured list/);
});
test('SE endpoint accepts a configured dealership and retains encrypted code printing',async()=>{
  let submitted;
  const response=await invoke('se-checkins.js',{instanceId,name:'Ana Cruz',contactNumber:'09171234567',dealership:'Toyota North'},async(url,options)=>{
    if(url.includes('test_drive_settings'))return Response.json([{timezone:'Asia/Manila',dealerships:['Toyota North']}]);
    submitted=JSON.parse(options.body);return Response.json('checkin');
  });
  assert.equal(response.status,201);assert.match((await response.json()).code,/^\d{4}$/);assert.equal(submitted.p_dealership,'Toyota North');assert.equal(submitted.p_contact_number,'09171234567');assert.ok(submitted.p_code_ciphertext);
});

test('SE form loads location options, submits the selected dealership and blocks an empty list',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/se-registration.js'),'utf8');
  async function formWith(dealerships) {
    let submit,posted;const button={disabled:true},message={},select={value:'',replaceChildren(...options){this.options=options;}};
    const form={elements:{namedItem:key=>key==='dealership'?select:{value:key==='contactNumber'?'09171234567':'Ana Cruz'}},querySelector:()=>button,reportValidity:()=>true,addEventListener:(_event,handler)=>{submit=handler;}};
    const ctx={URL,location:{href:`https://test.example/se-registration.html?id=${instanceId}`},encodeURIComponent,Option:function(text,value){return {text,value};},document:{getElementById:id=>id==='form'?form:message},fetch:async(_url,options)=>options?.method==='POST'?(posted=JSON.parse(options.body),Response.json({code:'0012',message:'Collect slip'})):Response.json({dealerships})};
    vm.runInNewContext(source,ctx);await new Promise(resolve=>setImmediate(resolve));
    if(dealerships.length){select.value=dealerships[0];await submit({preventDefault(){}});assert.equal(posted.dealership,dealerships[0]);assert.equal(form.hidden,true);assert.match(message.textContent,/0012/);}
    else{assert.equal(button.disabled,true);assert.equal(select.disabled,true);assert.match(message.textContent,/desktop Settings/);}
    return select;
  }
  assert.equal((await formWith(['Toyota North','Toyota South'])).options[1].value,'Toyota North');await formWith([]);
});

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

test('optional consent is determined by server text, never client claims',async()=>{
 for(const [waiverStatement,termsAndConditions] of [['',''],['Waiver',''],['','Terms'],['Waiver','Terms']]){
  let submitted=false;
  const response=await invoke('registrations.js',{...body,waiverAccepted:false,termsAccepted:false,waiverRequired:false,termsRequired:false},async(url)=>{
   if(url.endsWith('tdqsys_validate_se_code'))return Response.json({name:'Agent'});
   if(url.endsWith('tdqsys_public_registration_config'))return Response.json({waiverStatement,termsAndConditions});
   submitted=true;return Response.json({entries:[]});
  });
  const allowed=!waiverStatement&&!termsAndConditions;
  assert.equal(response.status,allowed?201:400);assert.equal(submitted,allowed);
 }
 for(const [waiverStatement,termsAndConditions,waiverAccepted,termsAccepted] of [['','Terms',false,true],['Waiver','',true,false]]){
  const response=await invoke('registrations.js',{...body,waiverAccepted,termsAccepted},async(url)=>Response.json(url.endsWith('tdqsys_public_registration_config')?{waiverStatement,termsAndConditions}:{entries:[]}));
  assert.equal(response.status,201);
 }
 const unavailable=await invoke('registrations.js',{...body,waiverAccepted:false},async(url)=>Response.json(url.endsWith('tdqsys_public_registration_config')?{}:{name:'Agent'}));
 assert.equal(unavailable.status,503);
});

test('printed waiver agreement is required only for populated waivers and cannot be bypassed',async()=>{
 for(const printedWaiverAccepted of [undefined,false,null,'true',1])for(const waiverStatement of ['Approved waiver','']){
  let allocated=false;
  const response=await invoke('registrations.js',{...body,printedWaiverAccepted},async(url)=>{
   if(url.endsWith('tdqsys_validate_se_code'))return Response.json({name:'Agent'});
   if(url.endsWith('tdqsys_public_registration_config'))return Response.json({waiverStatement,termsAndConditions:'Terms'});
   allocated=true;return Response.json({entries:[]});
  });
  assert.equal(response.status,waiverStatement?400:201);assert.equal(allocated,!waiverStatement);
  if(waiverStatement)assert.match((await response.json()).fields.printedWaiverAccepted,/sign a printed copy/);
 }
});
test('code endpoint never accepts a truncated five-digit code',async()=>{
  const response=await invoke('se-code.js',{instanceId,code:'01234'},()=>{throw Error('must not fetch');});
  assert.equal(response.status,400);
});

test('simulation registrations use the atomic run-scoped wrapper and reject non-TEST names',async()=>{
 let submitted;
 const client=await invoke('registrations.js',{...body,fullName:'TEST Client Trial',simulationRunId:modelId},async(url,options)=>{if(url.endsWith('tdqsys_validate_se_code'))return Response.json({name:'Agent'});assert.ok(url.endsWith('tdqsys_simulation_registration'));submitted=JSON.parse(options.body);return Response.json({entries:[]});});
 assert.equal(client.status,201);assert.equal(submitted.p_run_id,modelId);assert.equal(submitted.p_kind,'client');assert.equal(submitted.p_data.p_instance_id,instanceId);
 const agent=await invoke('se-checkins.js',{instanceId,name:'TEST Agent Trial',dealership:'Dealer',contactNumber:'00000000001',simulationRunId:modelId},async(url,options)=>{if(url.includes('test_drive_settings'))return Response.json([{timezone:'Asia/Manila',dealerships:['Dealer']}]);assert.ok(url.endsWith('tdqsys_simulation_registration'));submitted=JSON.parse(options.body);return Response.json('checkin');});
 assert.equal(agent.status,201);assert.equal(submitted.p_kind,'agent');assert.equal(submitted.p_data.p_contact_number,'00000000001');
 assert.equal((await invoke('registrations.js',{...body,simulationRunId:modelId},()=>{throw Error('must not fetch');})).status,400);
});
