'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readPublic,startEngine}=require('./helpers');
let eng;
before(async()=>{eng=await startEngine();});
after(async()=>{if(eng)await eng.stop();});

test('Google Sheets controls belong to Event Setup, not Settings',()=>{
  assert.match(readPublic('event-setup.html'),/src="settings-test-drive.js"/);
  assert.doesNotMatch(readPublic('settings.html'),/id="cfg-sheets-url"|src="settings-test-drive.js"|terms, sheetsUrl/);
  assert.match(readPublic('facilitator-shell.js'),/id="google-sheets-setup"/);
});

test('Sheets destination patch preserves queue numbers and all other config',async()=>{
  const before=await (await fetch(eng.base+'/api/data')).json();
  const sheetsUrl='https://docs.google.com/spreadsheets/d/test-location/edit';
  const response=await fetch(eng.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheetsUrl})});
  assert.equal(response.status,200);
  const after=await (await fetch(eng.base+'/api/data')).json();
  assert.deepEqual(after,{...before,config:{...before.config,testDrive:{...before.config.testDrive,sheetsUrl}}});
  for(const invalid of ['https://evil.test/sheet',123,null]) {
    assert.equal((await fetch(eng.base+'/api/save',{method:'POST',body:JSON.stringify({sheetsUrl:invalid})})).status,400);
    assert.deepEqual(await (await fetch(eng.base+'/api/data')).json(),after);
  }
});

test('Event Setup loads the saved URL and saves only that field; connect remains separate',async()=>{
  const ids=['sheets-share-email','sheets-connection-status','sheets-test','cfg-sheets-url','sheets-save','sheets-copy-email','sheets-status'];
  const elements=Object.fromEntries(ids.map(id=>[id,{value:'',addEventListener(){},reportValidity:()=>true}]));
  const requests=[];
  const context={document:{getElementById:id=>elements[id]},navigator:{clipboard:{writeText:async()=>{}}},
    window:{afDesktop:{testDrive:async body=>({ok:true,configured:true,serviceAccountEmail:'share@example.test',spreadsheetTitle:'Leads',tabTitle:'Today'})}},
    fetch:async(url,options)=>{requests.push({url,options});return Response.json(url==='/api/config'?{testDrive:{sheetsUrl:'https://docs.google.com/spreadsheets/d/saved/edit'}}:{success:true});}};
  vm.runInNewContext(readPublic('settings-test-drive.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(elements['cfg-sheets-url'].value,/saved/);
  elements['cfg-sheets-url'].value='https://docs.google.com/spreadsheets/d/new/edit';
  await elements['sheets-test'].onclick();
  assert.equal(requests.length,1,'Connection test must not save automatically');
  await elements['sheets-save'].onclick();
  assert.deepEqual(JSON.parse(requests[1].options.body),{sheetsUrl:elements['cfg-sheets-url'].value});
  assert.match(elements['sheets-connection-status'].textContent,/URL saved/);
});
