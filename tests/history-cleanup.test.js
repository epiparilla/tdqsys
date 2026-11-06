'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {HistoryCleanup}=require('../shared/history-cleanup');
const vm=require('node:vm');
const {readPublic}=require('./helpers');

function fixture({lostResponse=false}={}) {
  const files=new Map(),calls=[];let effects=0,reconciled=0;
  const queue={state:{outbox:[],archives:[]},remoteBusy:false,barrier:async()=>{queue.remoteBusy=true;}};
  const preview={fingerprint:'a'.repeat(64),confirmation:'CLEAN SLATE',summary:{registrations:2},runs:[],backup:{tables:{registrations:[{name:'private fixture'}]}}};
  const manager=new HistoryCleanup({queue,remote:async body=>{
    calls.push(body);if(body.action==='cleanup-preview')return structuredClone(preview);
    if(!effects){effects++;if(lostResponse)throw Error('Lost response');}
    return {deleted:true,mode:'clean',deletedRunIds:['old'],replayed:calls.filter(call=>call.action==='cleanup-apply').length>1};
  },chooseFile:async()=>'/chosen/private-backup.json',readLocal:()=>({config:{instanceId:'one',cloudWriterToken:'must-not-export'},queues:{}}),
    reconcile:async()=>{reconciled++;},files:{writeFileSync:(path,bytes)=>files.set(path,Buffer.from(bytes)),readFileSync:path=>files.get(path)},uuid:()=> 'backup-id',now:()=>1000});
  return {manager,files,calls,queue,preview,get effects(){return effects;},get reconciled(){return reconciled;}};
}

test('cleanup requires a verified unchanged backup and exact confirmation; renderer never receives raw backup data',async()=>{
  const f=fixture();const scope={mode:'clean',runIds:[]};
  const preview=await f.manager.handle({action:'history-preview',...scope});assert.equal(preview.backup,undefined);
  await assert.rejects(f.manager.handle({action:'history-delete',backupId:'missing',confirmation:'CLEAN SLATE'}),/fresh backup/);
  const backup=await f.manager.handle({action:'history-backup',...scope,fingerprint:preview.fingerprint});
  assert.equal(f.calls.some(call=>call.action==='cleanup-apply'),false);
  const saved=JSON.parse(f.files.get(backup.backupPath));assert.equal(saved.local.config.cloudWriterToken,undefined);assert.equal(saved.server.tables.registrations.length,1);
  await assert.rejects(f.manager.handle({action:'history-delete',backupId:backup.backupId,confirmation:'wrong'}),/exact cleanup confirmation/);
  f.files.set(backup.backupPath,Buffer.from('changed'));
  await assert.rejects(f.manager.handle({action:'history-delete',backupId:backup.backupId,confirmation:'CLEAN SLATE'}),/backup file changed/);
  assert.equal(f.effects,0);
});

test('cleanup UI requires preview, backup and matching confirmation before calling delete',async()=>{
  const ids=['history-cleanup','history-mode','history-refresh','history-preview','history-backup','history-confirm','history-delete','history-summary','history-phrase','history-status','history-run-list'];
  function element(){return {children:[],dataset:{},value:'',listeners:{},appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.listeners[type]=fn;}};}
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));nodes['history-mode'].value='selected';const calls=[];let dispatched=false;
  const context={document:{getElementById:id=>nodes[id],createElement:element,querySelectorAll:()=>nodes['history-run-list'].children.map(label=>label.children[0])},localStorage:{length:0},Event,
    window:{dispatchEvent(){dispatched=true;},afDesktop:{testDrive:async body=>{
      calls.push(body);if(body.action==='history-list')return {ok:true,runs:[{id:'closed',day:'2026-11-06',number:1,status:'closed'},{id:'active',day:'2026-11-06',number:2,status:'active'}]};
      if(body.action==='history-preview')return {ok:true,fingerprint:'hash',confirmation:'DELETE SELECTED RUNS',summary:{runs:1}};
      if(body.action==='history-backup')return {ok:true,backupId:'ticket',backupPath:'/private/backup.json'};
      return {ok:true,instanceId:'location',mode:'selected',deletedRunIds:['closed'],backupPath:'/private/backup.json'};
    }}}};
  vm.runInNewContext(readPublic('history-cleanup-ui.js'),context);await nodes['history-refresh'].onclick();
  assert.equal(nodes['history-run-list'].children[1].children[0].disabled,true);
  const check=nodes['history-run-list'].children[0].children[0];check.checked=true;check.onchange();
  await nodes['history-preview'].onclick();assert.equal(nodes['history-delete'].disabled,true);
  await nodes['history-backup'].onclick();nodes['history-confirm'].value='wrong';nodes['history-confirm'].oninput();assert.equal(nodes['history-delete'].disabled,true);
  await nodes['history-delete'].onclick();assert.equal(calls.some(call=>call.action==='history-delete'),false);
  nodes['history-confirm'].value='DELETE SELECTED RUNS';nodes['history-confirm'].oninput();await nodes['history-delete'].onclick();
  assert.equal(calls.filter(call=>call.action==='history-delete').length,1);assert.equal(dispatched,true);
});

test('data changed before export cannot authorize deletion',async()=>{
  const f=fixture();await assert.rejects(f.manager.handle({action:'history-backup',mode:'clean',runIds:[],fingerprint:'b'.repeat(64)}),/Data changed/);
  assert.equal(f.files.size,0);assert.equal(f.effects,0);assert.equal(f.queue.remoteBusy,false);
});

test('unconfirmed cleanup protects queue writes and retry reuses its idempotent request before local reconciliation',async()=>{
  const f=fixture({lostResponse:true});
  const backup=await f.manager.handle({action:'history-backup',mode:'clean',runIds:[],fingerprint:f.preview.fingerprint});
  const request={action:'history-delete',backupId:backup.backupId,confirmation:'CLEAN SLATE'};
  await assert.rejects(f.manager.handle(request),error=>error.cleanupUnconfirmed===true);
  assert.equal(f.queue.remoteBusy,true);await assert.rejects(f.manager.handle({action:'history-list'}),/unconfirmed/);
  assert.equal((await f.manager.handle({action:'history-resume'})).backupId,backup.backupId);
  const result=await f.manager.handle(request);assert.equal(result.replayed,true);assert.equal(f.effects,1);assert.equal(f.reconciled,1);assert.equal(f.queue.remoteBusy,false);
  assert.equal(f.calls.filter(call=>call.action==='cleanup-apply').every(call=>call.requestId===backup.backupId),true);
});
