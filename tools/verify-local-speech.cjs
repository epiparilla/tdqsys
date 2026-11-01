'use strict';
// Starts only a disposable local speech process on a free port, with its own
// data/cache directory. Never connects to the live location's TTS process.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=net.createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port; await new Promise(resolve=>server.close(resolve));
  const runtime=path.join(root,'.dev-db');fs.mkdirSync(runtime,{recursive:true});
  const data=fs.mkdtempSync(path.join(runtime,'speech-verify-'));
  const write=voice=>fs.writeFileSync(path.join(data,'data.json'),JSON.stringify({config:{announcements:{voice},brands:[{key:'brand1',models:[{prefix:'AA',pronounce:'A A'}]}]}}));
  write('af_nova');
  const binary=process.argv[2];
  const child=spawn(binary?path.resolve(binary):'python',binary?[]:[path.join(root,'tts_server.py')],{
    cwd:root,windowsHide:true,env:{...process.env,AF_DATA_DIR:data,AF_TTS_PORT:String(port),AF_TTS_DISABLE_WARMUP:'1'},stdio:['ignore','pipe','pipe']
  });
  let logs='';child.stdout.on('data',chunk=>{logs+=chunk;});child.stderr.on('data',chunk=>{logs+=chunk;});
  let exited=false;child.on('exit',()=>{exited=true;});child.on('error',error=>{logs+=error.message;exited=true;});
  try{
    let catalog;
    const start=Date.now();
    while(Date.now()-start<90000){
      if(exited)throw Error('Isolated speech process exited: '+logs.slice(-1200));
      try{const response=await fetch(`http://127.0.0.1:${port}/api/voices`);if(response.ok){catalog=await response.json();break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    assert.ok(catalog,'Voice catalog did not become ready.');assert.ok(catalog.voices.includes('af_nova'));assert.ok(catalog.voices.includes('af_heart'));
    assert.equal(catalog.selectedVoice,'af_nova');console.log(`PASS packaged catalog (${catalog.voices.length} voices) and saved selection.`);
    const text=encodeURIComponent('Test driver A A zero one.');
    const request=async voice=>{
      const response=await fetch(`http://127.0.0.1:${port}/api/announcement?text=${text}${voice?'&voice='+voice:''}`,{signal:AbortSignal.timeout(60000)});
      assert.equal(response.status,200);const audio=Buffer.from(await response.arrayBuffer());
      assert.equal(audio.subarray(0,4).toString(),'RIFF');assert.ok(audio.length>44);
      return{voice:response.headers.get('X-TDQSYS-Voice'),hash:createHash('sha256').update(audio).digest('hex')};
    };
    const selected=await request();assert.equal(selected.voice,'af_nova');
    write('not_packaged');
    const fallbackCatalog=await(await fetch(`http://127.0.0.1:${port}/api/voices`)).json();assert.equal(fallbackCatalog.fallback,true);
    const fallback=await request('not_packaged');assert.equal(fallback.voice,'af_heart');assert.notEqual(selected.hash,fallback.hash);
    console.log('PASS real local synthesis, voice-specific audio cache, and missing-voice fallback.');
  }finally{
    if(!exited){
      if(process.platform==='win32') await new Promise((resolve,reject)=>{
        const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        stop.once('error',reject);stop.once('exit',code=>code===0?resolve():reject(Error('Could not stop the disposable speech process tree.')));
      });
      else child.kill();
      await new Promise(resolve=>{if(exited)return resolve();child.once('exit',resolve);setTimeout(resolve,5000);});
    }
    if(!path.resolve(data).startsWith(path.resolve(runtime)+path.sep))throw Error('Invalid disposable directory.');
    if(exited)fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
