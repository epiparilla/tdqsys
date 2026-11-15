'use strict';
// Disposable data/port and synthetic client only. Physical playback suppressed.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const runtime=path.join(root,'.dev-db'),data=fs.mkdtempSync(path.join(runtime,'named-speech-verify-')),instanceId=randomUUID();
 const config={instanceId,brands:[{key:'brand1',name:'Test',models:[{label:'Test car',prefix:'AA',pronounce:'A A'}]}],namedAnnouncements:{...require('../public/named-announcements').defaults,enabled:true}};
 fs.writeFileSync(path.join(data,'data.json'),JSON.stringify({config,queues:{brand1:{1:99999}}}));
 fs.writeFileSync(path.join(data,`test-drive-${instanceId}.json`),JSON.stringify({instanceId,snapshot:{run:{id:'run',status:'active'},models:[{id:'model',brand_key:'brand1',unit_index:1,full_name:'Test car'}],entries:[{id:'entry',queue_run_id:'run',vehicle_model_id:'model',queue_number:99999,status:'waiting',registrations:{full_name:'Juan Dela Cruz'}}]}}));
 const binary=path.resolve(process.argv[2]),token=randomUUID(),child=spawn(binary,[],{cwd:root,windowsHide:true,env:{...process.env,AF_DATA_DIR:data,AF_TTS_PORT:String(port),AF_TTS_DISABLE_WARMUP:'0',AF_TTS_DISABLE_PLAYBACK:'1',AF_TTS_PLAYBACK_TOKEN:token},stdio:['ignore','pipe','pipe']});
 let logs='',exited=false;child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);child.on('exit',()=>{exited=true;});
 const url=`http://127.0.0.1:${port}`,headers={'Content-Type':'application/json','X-TDQSYS-Playback':token},body={brandKey:'brand1',unit:1,number:99999,kind:'ongoing',clientName:'Juan Dela Cruz'};
 const status=async()=>(await fetch(url+'/api/speech-status',{headers,signal:AbortSignal.timeout(5000)})).json();
 const post=(route,value,auth=headers)=>fetch(url+route,{method:'POST',headers:auth,body:JSON.stringify(value),signal:AbortSignal.timeout(60000)});
 async function waitFor(predicate){const deadline=Date.now()+150000;while(Date.now()<deadline){if(exited)throw Error(logs.slice(-1500));try{const state=await status();if(predicate(state))return state;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Isolated named speech timeout: '+logs.slice(-1000));}
 try{
  await waitFor(state=>state.prepared>=1);
  assert.equal((await post('/api/play-ticket',body,{'Content-Type':'application/json'})).status,403);
  const before=await status();assert.ok(before.prepared<4,'Need to exercise fallback before names finish');
  const started=performance.now(),first=await post('/api/play-ticket',body),result=await first.json();assert.equal(first.status,200);assert.equal(result.cacheReady,true);const elapsed=performance.now()-started;
  assert.ok(elapsed<500,`Cached fallback enqueue took ${elapsed}ms`);
  await waitFor(state=>state.completed===1);
  const fallback=Buffer.from(await(await post('/api/ticket-audio',{...body,clientName:''})).arrayBuffer());
  await waitFor(state=>state.prepared===4 && !state.warming);
  assert.equal((await status()).completed,1,'No unsolicited second call');
  const named=Buffer.from(await(await post('/api/ticket-audio',body)).arrayBuffer());
  assert.equal(named.subarray(0,4).toString(),'RIFF');assert.notDeepEqual(named,fallback);
  const second=await post('/api/play-ticket',{...body,kind:'callback'});assert.equal((await second.json()).cacheReady,true);
  await waitFor(state=>state.completed===2);
  console.log(JSON.stringify({mode:'whole-sentence',privateJournalWarmup:true,preparedClips:4,cachedFallbackEnqueueMs:Math.round(elapsed),fallbackAndNameDiffer:true,noAutomaticRepeat:true,physicalPlayback:false}));
 }finally{
  if(!exited)await new Promise((resolve,reject)=>{const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.once('error',reject);stop.once('exit',code=>code===0?resolve():reject(Error('Disposable speech shutdown failed')));});
  // Keep disposable evidence private for diagnosis; never modify a live profile.
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
