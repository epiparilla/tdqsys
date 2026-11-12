'use strict';
// Tracks the existing native speech FIFO without delaying playback or exposing
// its private token to a renderer. Two idle checks bridge gaps between jobs.
function createSpeechDucker({read,publish,schedule=setTimeout}) {
  let active=false,pending=0,timer=null,reading=false,idle=0,failures=0;
  function set(value) {if(active!==value){active=value;publish(value);}}
  function later(delay=100) {if(timer===null)timer=schedule(()=>{timer=null;check();},delay);}
  async function check() {
    if(reading)return;
    reading=true;
    try {
      const state=await read();failures=0;
      if(pending || state.playing || state.queued>0){idle=0;set(true);}
      else if(++idle>=2)set(false);
    } catch {
      // A stopped/unreachable speech service must not leave ads permanently quiet.
      if(!pending && ++failures>=2)set(false);
    } finally {reading=false;if(active)later();}
  }
  return {
    active:()=>active,
    begin() {
      pending++;idle=0;set(true);
      let released=false;
      return ()=>{if(released)return;released=true;pending--;later(0);};
    }
  };
}
module.exports={createSpeechDucker};
