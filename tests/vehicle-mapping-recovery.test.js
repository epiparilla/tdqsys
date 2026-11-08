'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {LocalTestDrive}=require('../shared/test-drive-local');
const {extractFunction}=require('./helpers');
const source=fs.readFileSync(path.join(__dirname,'../app/main.js'),'utf8');
const instanceId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const now=()=>new Date('2026-11-08T08:00:00Z');
const run={id:'run',instance_id:instanceId,status:'active',operating_day:'2026-11-08'};
const model=(id,name,unit)=>({id,instance_id:instanceId,brand_key:'brand1',unit_index:unit,full_name:name});
function snapshot(models){return {run,timezone:'Asia/Manila',models,entries:[],printJobs:[],seCheckins:[],modelDisplays:[]};}
async function using(fn){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdqsys-mapping-'));try{await fn(directory);}finally{fs.rmSync(directory,{recursive:true,force:true});}}
test('stale default Car 1 projection cannot block loading all seven configured cars in the same run',()=>using(async directory=>{
 const names=['Geely EX2','Geely EX5 EM-i','Geely EX5','Geely Monjaro','Geely Okavango','Geely Coolray','Geely Emgrand'];
 const config={instanceId,brands:[{key:'brand1',models:names.map(label=>({label}))}]};
 const fresh=snapshot(names.map((name,i)=>model('car-'+i,name,i+1)));
 fresh.modelDisplays=[{vehicle_model_id:'car-0',queue_number:5}];
 fresh.entries=[{id:'ticket',instance_id:instanceId,queue_run_id:run.id,vehicle_model_id:'car-0',queue_number:5,status:'ongoing',registrations:{full_name:'Test Client'}}];
 let cloudReads=0,notifications=0,writes=0;
 const queue=new LocalTestDrive({directory,instanceId,now,remote:async request=>{assert.equal(request.action,'snapshot');cloudReads++;return structuredClone(fresh);}});
 queue.acceptSnapshot(snapshot([model('old','Car 1',1)]));queue.prepareDisplayProjection();
 const archived={at:'earlier',operations:[{id:'retained-history'}]};queue.save({...structuredClone(queue.state),archives:[archived]});
 let state={config,queues:{brand1:Object.fromEntries(names.map((_,i)=>[i+1,0]))}};
 const context={structuredClone,displayProjection:null,PORT:18081,localConfig:()=>config,getLocalQueue:()=>queue,
  localQueueOwner:queue,engineDown:()=>false,app:{},RES_SERVER:directory,BASE_DIR:directory,path,
  require:()=>({status:()=>({canWrite:true})}),notifyLocalQueueChanged:()=>{notifications++;},cloudSyncTick:()=>{},
  fetch:async(url,options)=>{assert.ok(url.startsWith('http://localhost:18081/'));if(options?.method==='POST'){writes++;state=JSON.parse(options.body);}return Response.json(state);}};
 vm.createContext(context);vm.runInContext(['applyLocalDisplay','localQueueTick'].map(name=>extractFunction(source,name)).join('\n'),context);
 await context.localQueueTick(true);
 assert.equal(cloudReads,1,'A failed projection must not prevent snapshot synchronization');
 assert.equal(queue.view().models.length,7);assert.equal(queue.lastError,null);assert.equal(queue.state.displayPending.length,0);
 assert.equal(state.queues.brand1[1],5,'Use authoritative displayed number, not a blanket zero reset');assert.equal(writes,1);
 assert.equal(queue.view().entries[0].id,'ticket');assert.deepEqual(queue.state.archives,[archived]);assert.equal(queue.state.outbox.length,0);assert.ok(notifications>0);
 const restarted=new LocalTestDrive({directory,instanceId,now});assert.equal(restarted.view().models.length,7);assert.equal(restarted.state.displayPending.length,0);
}));
test('same-run model rename regenerates projection while preserving an unsynced ongoing action',()=>using(async directory=>{
 const queue=new LocalTestDrive({directory,instanceId,now});const first=snapshot([model('car','Old label',1)]);
 first.entries=[{id:'ticket',instance_id:instanceId,queue_run_id:run.id,vehicle_model_id:'car',queue_number:2,status:'waiting'}];
 queue.acceptSnapshot(first);queue.prepareDisplayProjection();queue.markDisplayApplied(queue.state.displayPending);
 queue.commit({action:'ongoing',entryId:'ticket'});const journal=structuredClone(queue.state.outbox);
 const fresh=structuredClone(first);fresh.models[0].full_name='New label';fresh.modelDisplays=[{vehicle_model_id:'car',queue_number:1}];
 queue.acceptSnapshot(fresh);queue.prepareDisplayProjection();
 assert.equal(queue.state.displayPending[0].fullName,'New label');assert.equal(queue.state.displayPending[0].number,2);
 assert.deepEqual(queue.state.outbox,journal);assert.equal(queue.view().entries[0].status,'ongoing');
}));
test('offline mapping mismatch keeps original journal and pending projection, rather than applying it to another car',()=>using(async directory=>{
 const queue=new LocalTestDrive({directory,instanceId,now,remote:async()=>{throw Error('offline');}});
 const stale=snapshot([model('old','Car 1',1)]);stale.entries=[{id:'ticket',instance_id:instanceId,queue_run_id:run.id,vehicle_model_id:'old',queue_number:2,status:'waiting'}];
 queue.acceptSnapshot(stale);queue.commit({action:'ongoing',entryId:'ticket'});queue.prepareDisplayProjection();
 const journal=structuredClone(queue.state.outbox),pending=structuredClone(queue.state.displayPending);
 const config={instanceId,brands:[{key:'brand1',models:[{label:'Different car'}]}]};let writes=0;
 const context={structuredClone,displayProjection:null,PORT:18081,localConfig:()=>config,getLocalQueue:()=>queue,localQueueOwner:queue,engineDown:()=>false,app:{},RES_SERVER:directory,BASE_DIR:directory,path,
  require:()=>({status:()=>({canWrite:true})}),notifyLocalQueueChanged:()=>{},cloudSyncTick:()=>{},fetch:async(_url,options)=>{if(options?.method==='POST')writes++;return Response.json({config,queues:{brand1:{1:9}}});}};
 vm.createContext(context);vm.runInContext(['applyLocalDisplay','localQueueTick'].map(name=>extractFunction(source,name)).join('\n'),context);
 await context.localQueueTick(true);assert.equal(writes,0);assert.deepEqual(queue.state.outbox,journal);assert.deepEqual(queue.state.displayPending,pending);assert.match(queue.lastError,/mapping changed/);
}));
test('fresh snapshot repairs orphaned derived display work even when its own model list has not changed',()=>using(async directory=>{
 const queue=new LocalTestDrive({directory,instanceId,now}),fresh=snapshot([model('current','Current car',1)]);
 fresh.modelDisplays=[{vehicle_model_id:'current',queue_number:8}];
 queue.acceptSnapshot(fresh);queue.prepareDisplayProjection();queue.markDisplayApplied(queue.state.displayPending);
 const next=structuredClone(queue.state);next.displayPending=[{operationId:'stale',modelId:'old',brandKey:'brand1',unit:1,fullName:'Car 1',number:0,runId:run.id}];queue.save(next);
 queue.acceptSnapshot(structuredClone(fresh));queue.prepareDisplayProjection();
 assert.equal(queue.state.displayPending.length,1);assert.equal(queue.state.displayPending[0].modelId,'current');assert.equal(queue.state.displayPending[0].number,8);
}));
test('poll result ordering alone does not rebuild TV work or overwrite pending operations',()=>using(async directory=>{
 const queue=new LocalTestDrive({directory,instanceId,now}),fresh=snapshot([model('a','Car A',1),model('b','Car B',2)]);
 queue.acceptSnapshot(fresh);queue.prepareDisplayProjection();queue.markDisplayApplied(queue.state.displayPending);
 const reordered=structuredClone(fresh);reordered.models.reverse();queue.acceptSnapshot(reordered);queue.prepareDisplayProjection();assert.equal(queue.state.displayPending.length,0);
}));
