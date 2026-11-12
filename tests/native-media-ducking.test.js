'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createSpeechDucker}=require('../shared/media-speech-duck');
const {read,extractFunction}=require('./helpers');
test('native FIFO ducks before enqueue and restores after two idle samples without delaying speech',async()=>{
 const timers=[],events=[];let status={playing:true,queued:1};
 const d=createSpeechDucker({read:async()=>status,publish:value=>events.push(value),schedule:fn=>{timers.push(fn);return timers.length;}});
 const tick=async()=>{timers.shift()();await new Promise(done=>setImmediate(done));};
 const finish=d.begin();assert.deepEqual(events,[true]);assert.equal(timers.length,0);finish();finish();
 await tick();assert.equal(d.active(),true);status={playing:false,queued:0};await tick();assert.equal(d.active(),true);
 const finishNext=d.begin();await tick();assert.equal(d.active(),true);finishNext();await tick();await tick();
 assert.deepEqual(events,[true,false]);assert.equal(timers.length,0);
});
test('unreachable native service restores volume instead of leaving ads quiet',async()=>{
 const timers=[],events=[];const d=createSpeechDucker({read:async()=>{throw Error('offline');},publish:v=>events.push(v),schedule:fn=>{timers.push(fn);return timers.length;}});
 d.begin()();for(let i=0;i<2;i++){timers.shift()();await new Promise(done=>setImmediate(done));}
 assert.deepEqual(events,[true,false]);assert.equal(timers.length,0);
});
test('Ongoing and Call Back signal ducking before network enqueue and release pending state on failure',async()=>{
 for(const kind of ['ongoing','callback'])for(const fail of [false,true]){
  const events=[];const context={getSpeechDucker:()=>({begin:()=>{events.push('duck');return ()=>events.push('release');}}),TTS_PORT:8002,TTS_PLAYBACK_TOKEN:'private',AbortSignal,
   fetch:async()=>{events.push('enqueue');if(fail)throw Error('unavailable');return Response.json({queued:true,cacheReady:true});}};
  vm.createContext(context);vm.runInContext(extractFunction(read('app/main.js'),'queueTicketSpeech'),context);
  const result=await context.queueTicketSpeech(kind,{brand_key:'brand1',unit_index:1},1);
  assert.deepEqual(events,['duck','enqueue','release']);assert.equal(result.speechQueued,!fail);
 }
});
test('native activity is restricted to local display/viewer pages and does not expose speech tokens',()=>{
 const source=read('app/main.js'),preload=read('app/preload.js');
 assert.match(source,/ipcMain.handle\('af:speechActivity'/);assert.match(source,/url.origin!==`http:\/\/localhost:\$\{PORT\}`/);
 assert.match(preload,/onSpeechActivity/);assert.doesNotMatch(read('public/media-ducking.js'),/TTS_PLAYBACK_TOKEN|X-TDQSYS-Playback/);
 assert.match(read('app/assemble-server.ps1'),/shared\\media-speech-duck.js/);
});
