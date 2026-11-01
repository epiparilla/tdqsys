'use strict';
// Live acceptance probe using only a new disposable location and a temporary
// Google tab. Never prints keys/tokens or inserts test leads in the real tab.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const PROJECT = 'pnyptdyfkftrcgjlaqnr';
const PREVIEW = 'https://test-drive-preview.tdqsys.pages.dev';
const INSTANCE = crypto.randomUUID();
const WRITER = crypto.randomUUID();
const SHEET = '1g5SQEP4hQqCecTA-JnfBqiue86B3hWFNW53qrQ5llfE';

async function main() {
  const [keyFile, executable] = process.argv.slice(2);
  if (!keyFile || !executable) throw Error('Provide a local Google JSON key and Supabase executable path.');
  const runtime = path.join(__dirname,'..','.dev-db'); fs.mkdirSync(runtime,{recursive:true});
  const sqlFile = path.join(runtime,`smoke-${INSTANCE}.sql`);
  function sql(query) {
    fs.writeFileSync(sqlFile,query,{mode:0o600});
    const result = spawnSync(executable,['db','query','--linked','--project-ref',PROJECT,'--file',sqlFile,'--output','json'],{encoding:'utf8',windowsHide:true});
    if(result.status!==0)throw Error('Disposable-location SQL operation failed.');
  }
  const credentials=JSON.parse(fs.readFileSync(keyFile,'utf8'));
  const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const unsigned=`${enc({alg:'RS256',typ:'JWT'})}.${enc({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+1200})}`;
  const assertion=`${unsigned}.${crypto.sign('RSA-SHA256',Buffer.from(unsigned),credentials.private_key).toString('base64url')}`;
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  if(!tokenResponse.ok)throw Error('Google authentication failed.');
  const googleToken=(await tokenResponse.json()).access_token;
  const googleHeaders={Authorization:`Bearer ${googleToken}`,'Content-Type':'application/json'};
  const sheetRoot=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}`;
  let tabId; let seeded=false;
  async function operation(body) {
    const response=await fetch(`https://${PROJECT}.supabase.co/functions/v1/test-drive-operations`,{
      method:'POST',headers:{'Content-Type':'application/json','X-TDQSYS-Instance':INSTANCE,'X-TDQSYS-Writer':WRITER},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Error(`Private operation ${body.action} failed: ${result.error || response.status}`);
    return result;
  }
  async function publicPost(route,body,key) {
    const response=await fetch(`${PREVIEW}/api/test-drive/${route}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw Error(`Public action ${route} failed: ${result.error || response.status}`);
    return result;
  }
  try {
    const created=await fetch(`${sheetRoot}:batchUpdate`,{method:'POST',headers:googleHeaders,body:JSON.stringify({requests:[{addSheet:{properties:{title:`TDQSYS verification ${INSTANCE.slice(0,8)}`}}}]})});
    if(!created.ok)throw Error('Google account lacks permission to create the temporary verification tab.');
    const properties=(await created.json()).replies[0].addSheet.properties;
    tabId=properties.sheetId;
    console.log('PASS Google write access (temporary verification tab created).');
    sql(`insert into public.tdqsys_queue_writers(instance_id,token_hash) values('${INSTANCE}','${crypto.createHash('sha256').update(WRITER).digest('hex')}');`);
    seeded=true;
    await operation({action:'configure',models:[{fullName:'Verification vehicle',shortname:'VERIFY',brandKey:'brand1',unit:1}],waiver:'Verification waiver',terms:'Verification terms',sheetsUrl:`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=${tabId}`});
    const info=await operation({action:'integration-info'});assert.equal(info.serviceAccountEmail,credentials.client_email);
    const connection=await operation({action:'test-sheets',sheetsUrl:`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=${tabId}`});
    assert.equal(connection.connected,true);assert.match(connection.tabTitle,/^TDQSYS Reg \d{2}\/\d{2}\/\d{4}$/);
    console.log('PASS desktop sharing-account guidance and automatic daily tab preparation.');
    const snapshot=await operation({action:'snapshot'}); assert.ok(snapshot.run?.id);
    console.log('PASS private authorization, configuration, and initial queue run.');
    const configResponse=await fetch(`${PREVIEW}/api/test-drive/config?id=${INSTANCE}`);
    const config=await configResponse.json(); assert.equal(config.models.length,1);
    const se=await publicPost('se-checkins',{instanceId:INSTANCE,name:'Verification Sales Executive',dealership:'Verification Dealership'});
    assert.match(se.code,/^\d{4}$/);
    const verified=await publicPost('se-code',{instanceId:INSTANCE,code:se.code}); assert.equal(verified.name,'Verification Sales Executive');
    console.log('PASS SE registration, encrypted code storage, and public code validation.');
    const submission={instanceId:INSTANCE,fullName:'Verification Client',email:'verification@example.com',cityAddress:'Verification City',contactNumber:'09170000000',modelIds:[config.models[0].id],seCode:se.code,waiverAccepted:true,termsAccepted:true,waiverVersion:config.waiverVersion,termsVersion:config.termsVersion};
    const requestKey=crypto.randomUUID();
    const registration=await publicPost('registrations',submission,requestKey);
    assert.equal(registration.entries[0].queueNumber,1);
    assert.deepEqual(await publicPost('registrations',submission,requestKey),registration);
    const duplicate=await publicPost('registrations',submission,crypto.randomUUID()); assert.equal(duplicate.entries[0].existing,true);
    console.log('PASS live ticket allocation, idempotent retry, and duplicate-name/model handling.');
    const staffSnapshot=await operation({action:'snapshot',includePrintCodes:true,includeSalesExecutives:true});
    const jobs=staffSnapshot.printJobs;
    const seJob=jobs.find(j=>j.kind==='se_code_slip');
    assert.equal(seJob.seCode,se.code);assert.equal(staffSnapshot.seCheckins[0].code,se.code);
    assert.equal(staffSnapshot.seCheckins[0].dealership,'Verification Dealership');
    assert.equal(JSON.stringify(staffSnapshot).includes('code_ciphertext'),false);
    console.log('PASS private Print Queue code preview and registered SE master list.');
    const slip=await operation({action:'claim-print',jobId:seJob.id}); assert.equal(slip.label.value,se.code);
    await operation({action:'print-result',jobId:seJob.id,status:'failed',error:'Automated cloud check; no physical printing attempted.'});
    await operation({action:'ongoing',entryId:registration.entries[0].entryId});
    console.log('PASS matching Pages/Edge encryption keys, print claim, and Ongoing operation.');
    // A gid no longer chooses the destination: the worker uses its daily tab.
    // Do not send synthetic registrations to the user's real daily tab.
    const range=`'${connection.tabTitle.replace(/'/g,"''")}'!A:K`;
    const rowsResponse=await fetch(`${sheetRoot}/values/${encodeURIComponent(range)}`,{headers:googleHeaders});
    const rows=(await rowsResponse.json()).values;
    assert.equal(rows[0][0],'Registration ID'); assert.equal(rows.some(row=>row[0]===registration.registrationId),false);
    console.log('PASS daily headers prepared without synthetic leads in the user daily tab.');
    await operation({action:'reset',reason:'Automated verification'});
    const after=await operation({action:'snapshot',history:true,includeSalesExecutives:true}); assert.equal(after.entries.length,0); assert.ok(after.earlierEntries.length>0);
    assert.equal(after.seCheckins[0].code,se.code);
    console.log('PASS same-day reset and earlier-run history.');
  } finally {
    if(seeded) {
      sql(`begin;
delete from sheet_sync_jobs where registration_id in(select id from registrations where instance_id='${INSTANCE}');
delete from print_jobs where instance_id='${INSTANCE}';
delete from display_state where instance_id='${INSTANCE}';
delete from queue_model_display where queue_run_id in(select id from queue_runs where instance_id='${INSTANCE}');
delete from test_drive_entries where instance_id='${INSTANCE}';
delete from registrations where instance_id='${INSTANCE}';
delete from se_daily_checkins where instance_id='${INSTANCE}';
delete from sales_executives where instance_id='${INSTANCE}';
delete from queue_counters where queue_run_id in(select id from queue_runs where instance_id='${INSTANCE}');
delete from queue_runs where instance_id='${INSTANCE}';
delete from vehicle_models where instance_id='${INSTANCE}';
delete from test_drive_settings where instance_id='${INSTANCE}';
delete from audit_log where instance_id='${INSTANCE}';
delete from tdqsys_queue_writers where instance_id='${INSTANCE}';
commit;`);
      console.log('Disposable cloud registration records removed.');
    }
    if(tabId!==undefined) {
      const cleanup=await fetch(`${sheetRoot}:batchUpdate`,{method:'POST',headers:googleHeaders,body:JSON.stringify({requests:[{deleteSheet:{sheetId:tabId}}]})});
      if(!cleanup.ok)throw Error(`Temporary verification tab ${tabId} could not be removed.`);
      console.log('Temporary verification tab removed; real registration tab left untouched.');
    }
    if(fs.existsSync(sqlFile))fs.unlinkSync(sqlFile);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
