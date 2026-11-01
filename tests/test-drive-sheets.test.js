'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const DATE = '2026-11-01T03:00:00Z';
const TITLE = 'TDQSYS Reg 11/01/2026';
const payload = { registrationId: 'registration-1', submittedAt:DATE, fullName: '=untrusted formula', contactNumber: '09170000000', models: ['RAV4','Camry'], forApplication: null };
function adapter(fetch) {
  const source = fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/google-sheets.js'),'utf8').replace(/export /g,'');
  const sandbox = { fetch, URL, URLSearchParams, TextEncoder, btoa, atob };
  vm.createContext(sandbox); vm.runInContext(source,sandbox);
  return sandbox;
}
test('Sheets retry detects the registration ID and does not append twice', async () => {
  let writes = 0;
  const api = adapter(async url => {
    if (url.includes('?fields=')) return Response.json({ sheets:[{ properties:{ sheetId:0,title:TITLE } }] });
    if (url.includes(':append')) { writes++; return Response.json({}); }
    return Response.json({ values:[['Registration ID'],['registration-1']] });
  });
  const result = await api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token');
  assert.equal(result.alreadyDelivered,true); assert.equal(writes,0);
});
test('Sheets appends raw data once per client and preserves phone numbers as strings', async () => {
  let sent; let header;
  const api = adapter(async (url, options) => {
    if (url.includes('?fields=')) return Response.json({ sheets:[{ properties:{ sheetId:0,title:TITLE } }] });
    if (options.method === 'PUT') { header=JSON.parse(options.body); return Response.json({}); }
    if (url.includes(':append')) { sent={url,body:JSON.parse(options.body)}; return Response.json({}); }
    return Response.json({ values:[] });
  });
  await api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token');
  assert.match(sent.url,/valueInputOption=RAW/); assert.equal(sent.body.values.length,1);
  assert.equal(header.values[0][0],'Registration ID');
  assert.equal(sent.body.values[0][3],payload.fullName); assert.equal(sent.body.values[0][5],'09170000000');
  assert.equal(sent.body.values[0][6],'RAV4, Camry');
});
test('Sheets refuses a destination whose existing columns do not match', async () => {
  const api = adapter(async url => url.includes('?fields=') ? Response.json({ sheets:[{ properties:{ sheetId:0,title:TITLE } }] }) : Response.json({values:[['Customer name']]}));
  await assert.rejects(api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token'),/different columns/);
});

test('Sheet connection check returns the selected destination without writing rows', async () => {
  let writes = 0;
  const api = adapter(async (url, options) => {
    if (options.method) writes++;
    return url.includes('?fields=')
      ? Response.json({ properties:{title:'Location B Leads'},sheets:[{properties:{sheetId:12,title:TITLE}}] })
      : Response.json({values:[['Registration ID']]});
  });
  const result = await api.verifySheetConnection('https://docs.google.com/spreadsheets/d/location-b/edit#gid=12', 'token', {instant:DATE});
  assert.equal(result.spreadsheetTitle,'Location B Leads'); assert.equal(result.tabTitle,TITLE);
  assert.equal(result.emptyTab,true); assert.equal(writes,0);
});

test('daily tab is created with headers while unrelated tabs and their data are preserved', async () => {
  const writes=[];
  const api=adapter(async(url,options)=>{
    if(url.includes('?fields='))return Response.json({sheets:[{properties:{sheetId:0,title:'Existing client records'}}]});
    if(url.endsWith(':batchUpdate')){
      const request=JSON.parse(options.body);writes.push(request);
      return Response.json({replies:[{addSheet:{properties:{sheetId:77,title:request.requests[0].addSheet.properties.title}}}]});
    }
    if(options.method==='PUT'){writes.push(JSON.parse(options.body));return Response.json({});}
    return Response.json({values:[]});
  });
  const result=await api.verifySheetConnection('https://docs.google.com/spreadsheets/d/abc/edit#gid=0','token',{instant:DATE});
  assert.equal(result.created,true);assert.equal(result.tabTitle,TITLE);
  assert.equal(writes[0].requests[0].addSheet.properties.title,TITLE);
  assert.equal(writes[1].values[0][0],'Registration ID');
  assert.equal(JSON.stringify(writes).includes('deleteSheet'),false);
});

test('concurrent daily tab creation reuses the tab created by another worker',async()=>{
  let reads=0;
  const api=adapter(async(url)=>{
    if(url.includes('?fields='))return Response.json({sheets:++reads===1?[]:[{properties:{sheetId:1,title:TITLE}}]});
    if(url.endsWith(':batchUpdate'))return Response.json({error:'already exists'},{status:400});
    return Response.json({values:[['Registration ID']]});
  });
  const result=await api.verifySheetConnection('https://docs.google.com/spreadsheets/d/abc/edit','token',{instant:DATE});
  assert.equal(result.tabTitle,TITLE);assert.equal(result.created,false);assert.equal(reads,2);
});

test('registration retries target the original local date after midnight',async()=>{
  const api=adapter(async url=>{
    if(url.includes('?fields='))return Response.json({sheets:[{properties:{sheetId:1,title:TITLE}}]});
    assert.ok(decodeURIComponent(url).includes(TITLE));
    return Response.json({values:[['Registration ID'],[payload.registrationId]]});
  });
  assert.equal((await api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit',payload,'token')).alreadyDelivered,true);
  assert.equal(api.registrationTabName('2026-11-01T16:01:00Z','Asia/Manila'),'TDQSYS Reg 11/02/2026');
});

test('creation permission failures do not write or clear any registration rows',async()=>{
  let rowWrites=0;
  const api=adapter(async(url,options)=>{
    if(url.includes('?fields='))return Response.json({sheets:[]});
    if(url.endsWith(':batchUpdate'))return Response.json({error:'permission denied'},{status:403});
    if(options.method)rowWrites++;
    return Response.json({});
  });
  await assert.rejects(api.verifySheetConnection('https://docs.google.com/spreadsheets/d/abc/edit','token',{instant:DATE}),/as Editor/);
  assert.equal(rowWrites,0);
});
