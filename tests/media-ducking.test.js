'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {extractFunction}=require('./helpers');
const root=path.join(__dirname,'..'),helper=fs.readFileSync(path.join(root,'public/media-ducking.js'),'utf8');
function fixture(desktop) {
 const player={volume:0.6,muted:false};
 const window={afDesktop:desktop,addEventListener(){}};
 vm.runInNewContext(helper,{window,document:{getElementById:()=>player}});
 return {player,duck:window.TdqMediaDucking};
}
test('media ducks to ten percent of its prior level, never compounds and restores only after all speech ends',()=>{
 const {player,duck}=fixture();duck.set(true);assert.equal(player.volume,0.06);
 duck.set(true);assert.equal(player.volume,0.06);duck.set(true,'native');duck.set(false);assert.equal(player.volume,0.06);
 duck.set(false,'native');assert.equal(player.volume,0.6);assert.equal(player.muted,false);
 player.volume=0;duck.set(true);duck.set(false);assert.equal(player.volume,0);
});
test('display reload synchronizes native activity and ignores stale initial state',async()=>{
 let notify,resolve;const {player}=fixture({onSpeechActivity:fn=>{notify=fn;},speechActivity:()=>new Promise(done=>{resolve=done;})});
 notify(true);resolve({active:false});await new Promise(done=>setImmediate(done));assert.equal(player.volume,0.06);
 notify(false);assert.equal(player.volume,0.6);
});
for(const file of ['display_with_ads.html','client.html'])test(file+' retains ducking through queued/reentrant speech and restores after errors',async()=>{
 const html=fs.readFileSync(path.join(root,'public',file),'utf8');assert.match(html,/src="media-ducking.js"/);
 const {player,duck}=fixture(),audios=[];
 const context={audioQueue:['first'],isPlaying:false,TdqMediaDucking:duck,console:{error(){}},Audio:function(url){this.url=url;this.play=()=>Promise.resolve();audios.push(this);}};
 vm.createContext(context);vm.runInContext(extractFunction(html,'playNextAudio'),context);
 context.playNextAudio();assert.equal(player.volume,0.06);
 context.playNextAudio();assert.equal(player.volume,0.06); // empty queue while clip still playing
 context.audioQueue.push('second');audios[0].onended();assert.equal(audios.length,2);assert.equal(player.volume,0.06);
 audios[0].onerror();assert.equal(audios.length,2);assert.equal(player.volume,0.06); // stale completion
 audios[1].onerror();assert.equal(player.volume,0.6);
 context.Audio=function(){this.play=()=>Promise.reject(Error('blocked'));};context.audioQueue.push('blocked');context.playNextAudio();
 await new Promise(done=>setImmediate(done));assert.equal(player.volume,0.6);
});
