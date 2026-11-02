'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {LocalTestDrive}=require('../shared/test-drive-local');
const {extractFunction}=require('./helpers');
const source=fs.readFileSync(path.join(__dirname,'../app/main.js'),'utf8');
test('queue refresh notifications reach only local staff windows and carry no private records',()=>{
    const sent=[];
    const urls=['http://localhost:18081/dashboard.html','http://localhost:18081/master-table.html','http://localhost:18081/settings.html','https://example.test/dashboard.html','http://localhost:18081/client.html'];
    const windows=urls.map(url=>({isDestroyed:()=>false,webContents:{getURL:()=>url,send:(...args)=>sent.push({url,args})}}));
    const context={PORT:18081,URL,BrowserWindow:{getAllWindows:()=>windows}};
    vm.runInNewContext(extractFunction(source,'notifyLocalQueueChanged')+'\nnotifyLocalQueueChanged();',context);
    assert.equal(sent.length,2);assert.equal(sent[0].args[0],'af:local-queue-changed');assert.equal(sent[0].args.length,1);
});
test('two local requests preserve commit/playback ordering even across asynchronous projection',async()=>{
    const order=[];let release;
    const ctx={localActionChain:Promise.resolve(),localQueueAction:async request=>{
        order.push('start-'+request.entryId);if(request.entryId==='first')await new Promise(done=>{release=done;});order.push('speak-'+request.entryId);
    }};
    vm.createContext(ctx);vm.runInContext(extractFunction(source,'dispatchLocalQueueAction'),ctx);
    const first=ctx.dispatchLocalQueueAction({entryId:'first'},{}),second=ctx.dispatchLocalQueueAction({entryId:'second'},{});
    await new Promise(done=>setImmediate(done));assert.deepEqual(order,['start-first']);release();await Promise.all([first,second]);
    assert.deepEqual(order,['start-first','speak-first','start-second','speak-second']);
});

test('actual native local action helper persists and projects Ongoing without waiting for a blocked cloud',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdqsys-hotpath-'));
    try {
        const instanceId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        const config={instanceId,brands:[{key:'brand1',models:[{label:'Car A',prefix:'AA'},{label:'Car B',prefix:'BB'}]}]};
        let cloudCalls=0;
        const queue=new LocalTestDrive({directory,instanceId,now:()=>new Date('2026-11-03T04:00:00Z'),remote:()=>{cloudCalls++;return new Promise(()=>{});}});
        queue.acceptSnapshot({run:{id:'current',status:'active',operating_day:'2026-11-03'},entries:[
          {id:'a1',instance_id:instanceId,queue_run_id:'current',vehicle_model_id:'a',queue_number:1,status:'waiting'}],
          models:[{id:'a',full_name:'Car A',brand_key:'brand1',unit_index:1}],printJobs:[]});
        let state={config,queues:{brand1:{1:0,2:8}}};const speech=[],scheduled=[];
        const context={structuredClone,displayProjection:null,PORT:18081,localConfig:()=>config,getLocalQueue:()=>queue,registrationSyncStatus:{},
          setTimeout:fn=>{scheduled.push(fn);},localQueueTick:()=>{},notifyLocalQueueChanged:()=>{},cloudSyncTick:()=>{context.mirrored=true;},
          queueTicketSpeech:async(kind,model,number)=>{speech.push({kind,model,number});return {speechQueued:true};},
          fetch:async(url,options)=>{
            assert.ok(url.startsWith('http://localhost:18081/'));
            if(options?.method==='POST'){state=JSON.parse(options.body);return Response.json({success:true});}
            return Response.json(state);
          }};
        vm.createContext(context);vm.runInContext(['applyLocalDisplay','decorateLocalSnapshot','localQueueAction'].map(name=>extractFunction(source,name)).join('\n'),context);
        const started=performance.now(),result=await context.localQueueAction({action:'ongoing',entryId:'a1'},config);
        const elapsed=performance.now()-started;
        assert.equal(result.ok,true);assert.equal(result.localSnapshot.entries[0].status,'ongoing');assert.equal(queue.state.outbox.length,1);
        assert.deepEqual(state.queues,{brand1:{1:1,2:8}});assert.equal(context.mirrored,true);assert.equal(speech.length,1);assert.equal(speech[0].number,1);assert.equal(cloudCalls,0);
        assert.ok(elapsed<500,`Local hot path unexpectedly slow: ${elapsed}ms`);
        console.log(`Local action save/display/speech enqueue: ${elapsed.toFixed(2)}ms; cloud calls on the hot path: ${cloudCalls}.`);
        await context.localQueueAction({action:'callback',entryId:'a1'},config);
        assert.equal(speech.length,2);assert.equal(queue.state.outbox.length,1);assert.equal(cloudCalls,0);
        const restored=new LocalTestDrive({directory,instanceId,now:()=>new Date('2026-11-03T04:00:00Z')});assert.equal(restored.view().entries[0].status,'ongoing');
        let release;
        queue.remote=async request=>{
            cloudCalls++;
            if(request.action==='snapshot')return queue.view();
            await new Promise(done=>{release=done;});return {operationId:request.operation.id};
        };
        const syncing=queue.sync({force:true});await new Promise(done=>setImmediate(done));assert.equal(cloudCalls,1);
        const callbackStart=performance.now();await context.localQueueAction({action:'callback',entryId:'a1'},config);
        assert.ok(performance.now()-callbackStart<500);assert.equal(cloudCalls,1);assert.equal(speech.length,3);
        release();await syncing;assert.equal(queue.state.outbox.length,0);
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
