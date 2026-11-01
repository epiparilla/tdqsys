'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const payload = { registrationId: 'registration-1', fullName: '=untrusted formula', contactNumber: '09170000000', models: ['RAV4','Camry'], forApplication: null };
function adapter(fetch) {
  const source = fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/google-sheets.js'),'utf8').replace(/export /g,'');
  const sandbox = { fetch, URL, URLSearchParams, TextEncoder, btoa, atob };
  vm.createContext(sandbox); vm.runInContext(source,sandbox);
  return sandbox;
}
test('Sheets retry detects the registration ID and does not append twice', async () => {
  let writes = 0;
  const api = adapter(async url => {
    if (url.includes('?fields=')) return Response.json({ sheets:[{ properties:{ sheetId:0,title:'TDQ REGISTRATION' } }] });
    if (url.includes(':append')) { writes++; return Response.json({}); }
    return Response.json({ values:[['Registration ID'],['registration-1']] });
  });
  const result = await api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token');
  assert.equal(result.alreadyDelivered,true); assert.equal(writes,0);
});
test('Sheets appends raw data once per client and preserves phone numbers as strings', async () => {
  let sent;
  const api = adapter(async (url, options) => {
    if (url.includes('?fields=')) return Response.json({ sheets:[{ properties:{ sheetId:0,title:'TDQ REGISTRATION' } }] });
    if (url.includes(':append')) { sent={url,body:JSON.parse(options.body)}; return Response.json({}); }
    return Response.json({ values:[] });
  });
  await api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token');
  assert.match(sent.url,/valueInputOption=RAW/); assert.equal(sent.body.values.length,2);
  assert.equal(sent.body.values[1][3],payload.fullName); assert.equal(sent.body.values[1][5],'09170000000');
  assert.equal(sent.body.values[1][6],'RAV4, Camry');
});
test('Sheets refuses a destination whose existing columns do not match', async () => {
  const api = adapter(async url => url.includes('?fields=') ? Response.json({ sheets:[{ properties:{ sheetId:0,title:'Sheet1' } }] }) : Response.json({values:[['Customer name']]}));
  await assert.rejects(api.appendRegistration('https://docs.google.com/spreadsheets/d/abc/edit#gid=0',payload,'token'),/empty tracking tab/);
});
