'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LocalTestDrive}=require('../shared/test-drive-local');
const INSTANCE='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW=new Date('2026-11-03T04:00:00Z');
function snapshot(run='run1') {
    return {run:{id:run,status:'active',operating_day:'2026-11-03'},timezone:'Asia/Manila',models:[{id:'a',brand_key:'brand1',unit_index:1,full_name:'Model A'},{id:'b',brand_key:'brand1',unit_index:2,full_name:'Model B'}],
      entries:[['a1','a',1,'ongoing'],['a2','a',2,'waiting'],['b1','b',1,'ongoing']].map(([id,model,number,status])=>({id,instance_id:INSTANCE,queue_run_id:run,vehicle_model_id:model,queue_number:number,status,registrations:{full_name:id}})),printJobs:[],seCheckins:[]};
}
async function using(fn) {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdqsys-local-'));
    try {await fn(directory);} finally {fs.rmSync(directory,{recursive:true,force:true});}
}
test('local operations persist across restart, advance only the selected model, and never call the network',()=>using(async directory=>{
    let requests=0;const options={directory,instanceId:INSTANCE,now:()=>NOW,remote:async()=>{requests++;throw Error('offline');}};
    const queue=new LocalTestDrive(options);queue.acceptSnapshot(snapshot());
    queue.commit({action:'ongoing',entryId:'a2'});
    const restarted=new LocalTestDrive(options),view=restarted.view();
    assert.deepEqual(view.entries.map(entry=>entry.status),['done','ongoing','ongoing']);assert.equal(view.localSync.pending,1);assert.equal(requests,0);
    assert.equal(restarted.state.displayPending[0].number,2);restarted.markDisplayApplied(restarted.state.displayPending);assert.equal(restarted.state.displayPending.length,0);
    assert.equal(restarted.ticket('a2').entry.queue_number,2);assert.equal(restarted.state.outbox.length,1);
}));
test('failed atomic save does not expose an unrecorded action',()=>using(async directory=>{
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW});queue.acceptSnapshot(snapshot());
    queue.save=()=>{throw Error('disk unavailable');};
    assert.throws(()=>queue.commit({action:'ongoing',entryId:'a2'}),/disk unavailable/);
    assert.equal(queue.view().entries[1].status,'waiting');assert.equal(queue.state.outbox.length,0);
}));

test('midnight queues a durable zero display while preserving history and unsynced actions',()=>using(async directory=>{
    let clock=NOW;
    const options={directory,instanceId:INSTANCE,now:()=>clock};
    const queue=new LocalTestDrive(options);queue.acceptSnapshot(snapshot());queue.commit({action:'ongoing',entryId:'a2'});
    queue.prepareDisplayProjection();assert.equal(queue.state.displayPending[0].number,2);
    queue.markDisplayApplied(queue.state.displayPending);
    clock=new Date('2026-11-03T16:00:00Z'); // midnight in the location, not UTC
    queue.prepareDisplayProjection();assert.deepEqual(queue.state.displayPending.map(item=>item.number),[0,0]);
    assert.equal(queue.view().entries.length,0);assert.equal(queue.state.snapshot.entries.length,3);assert.equal(queue.state.outbox.length,1);
    const restarted=new LocalTestDrive(options);assert.deepEqual(restarted.state.displayPending.map(item=>item.number),[0,0]);
    restarted.markDisplayApplied(restarted.state.displayPending);restarted.prepareDisplayProjection();assert.equal(restarted.state.displayPending.length,0);
    const today=snapshot('today');today.run.operating_day='2026-11-04';today.entries=[];
    restarted.acceptSnapshot(today);restarted.prepareDisplayProjection();assert.deepEqual(restarted.state.displayPending.map(item=>item.number),[0,0]);
    assert.equal(restarted.state.outbox.length,1);assert.equal(restarted.state.outbox[0].blocked,true);
}));

test('loading a current run restores its model displays and a same-day reset projects zero',()=>using(async directory=>{
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW});
    const current=snapshot();current.modelDisplays=[{vehicle_model_id:'a',queue_number:7},{vehicle_model_id:'b',queue_number:4}];
    queue.acceptSnapshot(current);queue.prepareDisplayProjection();assert.deepEqual(queue.state.displayPending.map(item=>item.number),[7,4]);
    queue.markDisplayApplied(queue.state.displayPending);queue.prepareDisplayProjection();assert.equal(queue.state.displayPending.length,0);
    const reset=snapshot('new-run');reset.entries=[];reset.modelDisplays=[];
    queue.acceptSnapshot(reset);queue.prepareDisplayProjection();assert.deepEqual(queue.state.displayPending.map(item=>item.number),[0,0]);
}));
test('stale cloud snapshots cannot undo pending local changes or drop newly registered clients',()=>using(async directory=>{
    let resolve;const remote=()=>new Promise(done=>{resolve=done;});
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW,remote});queue.acceptSnapshot(snapshot());
    const pulling=queue.sync({force:true});await new Promise(done=>setImmediate(done));
    queue.commit({action:'ongoing',entryId:'a2'});
    const fresh=snapshot();fresh.entries.push({...fresh.entries[1],id:'a3',queue_number:3});resolve(fresh);await pulling;
    assert.equal(queue.view().entries.find(entry=>entry.id==='a2').status,'ongoing');assert.ok(queue.view().entries.some(entry=>entry.id==='a3'));assert.equal(queue.state.outbox.length,1);
}));
test('lost acknowledgement retries the same operation ID in order and acknowledged changes stay visible',()=>using(async directory=>{
    let fail=true;const sent=[],seen=new Set();let applied=0;
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW,remote:async request=>{
        if(request.action==='snapshot')return snapshot();
        sent.push(request.operation.id);if(!seen.has(request.operation.id)){seen.add(request.operation.id);applied++;}
        if(fail){fail=false;throw Error('response lost');}
        return {operationId:request.operation.id};
    }});queue.acceptSnapshot(snapshot());queue.commit({action:'ongoing',entryId:'a2'});queue.commit({action:'status',entryId:'a2',status:'done'});
    await queue.sync({force:true});assert.equal(queue.state.outbox.length,2);
    // Suppress the deliberately stale mock snapshot: test acknowledgement itself.
    queue.pollAt=Number.MAX_SAFE_INTEGER;queue.retryAt=0;await queue.sync();
    assert.equal(sent[0],sent[1]);assert.equal(applied,2);assert.equal(queue.state.outbox.length,0);assert.equal(queue.view().entries[1].status,'done');
}));
test('run changes retain conflicts, prevent new calls, and require explicit archival without deleting registrations',()=>using(async directory=>{
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW});queue.acceptSnapshot(snapshot());queue.commit({action:'ongoing',entryId:'a2'});
    queue.acceptSnapshot(snapshot('run2'));assert.equal(queue.status().blocked,true);assert.equal(queue.status().earlierRunPending,true);
    assert.throws(()=>queue.ticket('a2'),/need review/);assert.throws(()=>queue.archiveEarlierRun(false),/Confirm/);
    assert.equal(queue.archiveEarlierRun(true).archived,1);assert.equal(queue.state.archives[0].operations.length,1);assert.equal(queue.view().entries.length,3);assert.equal(queue.state.outbox.length,0);
}));
test('wrong-location data, wrong tickets, closed clients and next-day cached runs are refused',()=>using(async directory=>{
    let clock=NOW;const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>clock});queue.acceptSnapshot(snapshot());
    const foreign=snapshot();foreign.entries[0].instance_id='other';assert.throws(()=>queue.acceptSnapshot(foreign),/another location/);
    assert.throws(()=>queue.ticket('foreign'),/no longer/);
    queue.commit({action:'status',entryId:'a2',status:'no_show'});assert.throws(()=>queue.ticket('a2'),/no longer/);
    clock=new Date('2026-11-04T04:00:00Z');assert.equal(queue.view().entries.length,0);assert.equal(queue.status().ready,false);assert.throws(()=>queue.ticket('a1'),/today/);
}));
test('transient failures back off; permanent failures preserve the journal and block dependent mutations',()=>using(async directory=>{
    let calls=0;const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW,remote:async()=>{calls++;throw Error('offline');}});
    queue.acceptSnapshot(snapshot());queue.commit({action:'ongoing',entryId:'a2'});await queue.sync();await queue.sync();assert.equal(calls,1);
    queue.remote=async()=>{throw Object.assign(Error('run no longer active'),{status:409});};await queue.sync({force:true});
    assert.equal(queue.status().blocked,true);assert.equal(queue.state.outbox.length,1);await assert.rejects(queue.barrier(),/must sync/);
    assert.equal(queue.remoteBusy,false);
}));
test('cache survives basic polling enrichment and corrupt files are retained rather than overwritten',()=>using(async directory=>{
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW});const rich=snapshot();rich.entries[0].agentCode='0012';rich.seCheckins=[{id:'se'}];queue.acceptSnapshot(rich,{includeSalesExecutives:true});
    queue.acceptSnapshot(snapshot());assert.equal(queue.view().entries[0].agentCode,'0012');assert.equal(queue.view().seCheckins.length,1);
    fs.writeFileSync(queue.file,'broken');assert.throws(()=>new LocalTestDrive({directory,instanceId:INSTANCE}),SyntaxError);assert.equal(fs.readFileSync(queue.file,'utf8'),'broken');
}));
test('acknowledgement disk failure retains the same retry ID and projection acknowledgements cannot erase newer displays',()=>using(async directory=>{
    const requests=[],seen=new Set();
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW,remote:async request=>{
        if(request.action==='snapshot')return queue.view();
        requests.push(request.operation.id);seen.add(request.operation.id);return {operationId:request.operation.id};
    }});queue.acceptSnapshot(snapshot());queue.commit({action:'ongoing',entryId:'a1'});
    const older=structuredClone(queue.state.displayPending);queue.commit({action:'ongoing',entryId:'a2'});queue.markDisplayApplied(older);
    assert.equal(queue.state.displayPending[0].number,2);
    const original=queue.save.bind(queue);let fail=true;
    queue.save=next=>{if(fail && next.outbox.length<queue.state.outbox.length){fail=false;throw Error('disk full');}original(next);};
    await queue.sync({force:true});assert.equal(queue.state.outbox.length,2);
    await queue.sync({force:true});assert.equal(queue.state.outbox.length,0);assert.equal(requests[0],requests[1]);assert.equal(seen.size,2);
}));
test('manual barriers exclude concurrent remote actions and blocked current-run actions can be retried after recovery',()=>using(async directory=>{
    const queue=new LocalTestDrive({directory,instanceId:INSTANCE,now:()=>NOW});queue.acceptSnapshot(snapshot());
    await queue.barrier();await assert.rejects(queue.barrier(),/in progress/);assert.equal(queue.remoteBusy,true);queue.remoteBusy=false;
    queue.commit({action:'ongoing',entryId:'a2'});const next=structuredClone(queue.state);next.outbox[0].blocked=true;next.outbox[0].error='license_revoked';queue.save(next);
    assert.equal(queue.status().blocked,true);queue.retryBlocked();assert.equal(queue.status().blocked,false);assert.equal(queue.state.outbox.length,1);
}));
