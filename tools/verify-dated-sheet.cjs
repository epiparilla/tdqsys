'use strict';
// Execute the real adapter against an unused far-future dated tab. Remove
// only the tab created by this probe; never write test leads in today's tab.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto,randomUUID}=require('node:crypto');
(async()=>{
  const [keyFile,sheetUrl]=process.argv.slice(2);
  const credentials=JSON.parse(fs.readFileSync(keyFile,'utf8'));
  const parsed=new URL(sheetUrl),id=parsed.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
  if(parsed.origin!=='https://docs.google.com'||!id)throw Error('Invalid spreadsheet URL.');
  const root=`https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  let probeTitle,ownedTabId;
  const trackedFetch=async(url,options)=>{
    const response=await fetch(url,options);
    if(url===`${root}:batchUpdate`&&options?.method==='POST'&&response.ok){
      const request=JSON.parse(options.body);
      if(request.requests?.[0]?.addSheet?.properties?.title===probeTitle){
        ownedTabId=(await response.clone().json()).replies[0].addSheet.properties.sheetId;
      }
    }
    return response;
  };
  const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/google-sheets.js'),'utf8').replace(/export /g,'');
  const api={fetch:trackedFetch,URL,URLSearchParams,TextEncoder,TextDecoder,btoa,atob,crypto:webcrypto};
  vm.createContext(api);vm.runInContext(source,api);
  const token=await api.googleToken(credentials),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const before=await fetch(`${root}?fields=sheets.properties`,{headers});if(!before.ok)throw Error('Cannot inspect spreadsheet.');
  const titles=new Set((await before.json()).sheets.map(s=>s.properties.title));
  let instant=new Date('2099-12-31T03:00:00Z');
  for(let i=0;i<365&&titles.has(api.registrationTabName(instant));i++)instant=new Date(instant.getTime()-86400000);
  probeTitle=api.registrationTabName(instant);if(titles.has(probeTitle))throw Error('No unused probe date available.');
  try{
    const created=await api.verifySheetConnection(sheetUrl,token,{instant});
    assert.equal(created.created,true);assert.equal(created.tabTitle,probeTitle);assert.equal(created.tabId,ownedTabId);
    const reused=await api.verifySheetConnection(sheetUrl,token,{instant});assert.equal(reused.created,false);assert.equal(reused.tabId,ownedTabId);
    console.log('PASS exact dated tab creation, headers, and reuse.');
    const payload={registrationId:`tdqsys-verification-${randomUUID()}`,submittedAt:instant.toISOString(),fullName:'Temporary verification',contactNumber:'09170000000',models:['Verification vehicle']};
    assert.equal((await api.appendRegistration(sheetUrl,payload,token)).alreadyDelivered,false);
    assert.equal((await api.appendRegistration(sheetUrl,payload,token)).alreadyDelivered,true);
    console.log('PASS original registration date routing and duplicate-safe raw-data write.');
  }finally{
    if(ownedTabId!==undefined){
      const cleanup=await fetch(`${root}:batchUpdate`,{method:'POST',headers,body:JSON.stringify({requests:[{deleteSheet:{sheetId:ownedTabId}}]})});
      if(!cleanup.ok)throw Error(`Probe tab ${ownedTabId} could not be removed.`);
      console.log('Owned verification tab removed; existing tabs and real client rows untouched.');
    }
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
