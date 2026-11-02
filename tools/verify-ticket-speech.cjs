'use strict';
// Disposable cache/port only. Playback is suppressed so no live queue is heard
// or modified; the real renderer and native FIFO transport are still exercised.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const runtime=path.join(root,'.dev-db');fs.mkdirSync(runtime,{recursive:true});const data=fs.mkdtempSync(path.join(runtime,'ticket-speech-'));
 fs.writeFileSync(path.join(data,'data.json'),JSON.stringify({config:{brands:[{key:'brand1',name:'Test',models:[{label:'Test model',prefix:'AA',pronounce:'A A'}]}],announcements:{voice:'af_heart',prefix:'Test driver',template:'{ticket}',suffix:'please approach'},testDrive:{callbackPrefix:'Test driver',callbackSuffix:'please stand by for'}}}));
 const token=randomUUID(),binary=process.argv[2],child=spawn(binary?path.resolve(binary):'python',binary?[]:[path.join(root,'tts_server.py')],{cwd:root,windowsHide:true,env:{...process.env,AF_DATA_DIR:data,AF_TTS_PORT:String(port),AF_TTS_DISABLE_WARMUP:'1',AF_TTS_DISABLE_PLAYBACK:'1',AF_TTS_PLAYBACK_TOKEN:token},stdio:['ignore','pipe','pipe']});
 let logs='',exited=false;child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});child.on('exit',()=>{exited=true;});
 const url=`http://127.0.0.1:${port}`,headers={'Content-Type':'application/json','X-TDQSYS-Playback':token};
 const post=(route,body,extra=headers)=>fetch(url+route,{method:'POST',headers:extra,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
 const body={kind:'ongoing',brandKey:'brand1',unit:1,number:1};
 try{
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){if(exited)throw Error(logs.slice(-1200));try{if((await fetch(url+'/api/voices')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,300));}
  assert.ok(ready,'Speech service did not start.');assert.equal((await post('/api/play-ticket',body,{'Content-Type':'application/json'})).status,403);
  for(const kind of ['ongoing','callback']){const response=await post('/api/prepare-ticket',{...body,kind});assert.equal(response.status,200,await response.text());}
  const status=async()=>(await fetch(url+'/api/speech-status',{headers})).json();const before=await status();const timings=[];
  const savedConfig=JSON.parse(fs.readFileSync(path.join(data,'data.json'))).config;
  const draft={...savedConfig.announcements,brandName:'Test',model:savedConfig.brands[0].models[0],...savedConfig.testDrive,number:1};
  assert.equal((await post('/api/preview-ticket',{...draft,kind:'ongoing'},{'Content-Type':'application/json'})).status,403);
  for(const kind of ['ongoing','callback']) {
    const preview=await post('/api/preview-ticket',{...draft,kind}),live=await post('/api/ticket-audio',{...body,kind});
    assert.equal(preview.status,200);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),Buffer.from(await live.arrayBuffer()));
  }
  const invalid=await post('/api/preview-ticket',{...draft,template:'{unknown}'});assert.equal(invalid.status,400);
  const unsaved=await post('/api/preview-ticket',{...draft,prefix:'Unsaved preview phrase'});assert.equal(unsaved.status,200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'data.json'))).config.announcements.prefix,'Test driver');
  assert.equal((await status()).completed,0);
  const clipsAfterPreviews=(await status()).cachedClips;
  for(let i=0;i<5;i++){const started=performance.now(),response=await post('/api/ticket-audio',body),wav=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.equal(wav.subarray(0,4).toString(),'RIFF');timings.push(performance.now()-started);}
  assert.equal((await status()).cachedClips,clipsAfterPreviews);const median=timings.sort((a,b)=>a-b)[2];assert.ok(median<500,`Cached request too slow: ${median}ms`);
  for(const kind of ['ongoing','callback']){const response=await post('/api/play-ticket',{...body,kind});assert.equal(response.status,200);assert.equal((await response.json()).cacheReady,true);}
  const finish=Date.now()+5000;let after;
  do{after=await status();if(after.completed===2)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<finish);
  assert.equal(after.completed,2);assert.equal(after.lastError,null);
  console.log(JSON.stringify({privatePlaybackGuard:true,previewMatchesLiveBytes:true,unsavedSettingsPreserved:true,clipsReused:true,cachedAssemblyMedianMs:Math.round(median*100)/100,completedFIFOJobs:after.completed,physicalPlaybackSuppressed:true}));
 }finally{
  if(!exited){if(process.platform==='win32'){const stopped=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});if(stopped.status!==0)throw Error('Could not stop disposable speech process.');}else child.kill();}
  child.stdout.destroy();child.stderr.destroy();
  if(!path.resolve(data).startsWith(path.resolve(runtime)+path.sep))throw Error('Invalid disposable cache path.');
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
