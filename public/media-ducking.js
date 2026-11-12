'use strict';
(() => {
  const reasons=new Set();
  let normalVolume=null,revision=0;
  function set(active,reason='browser') {
    const player=document.getElementById('ad-video');
    if(!player)return;
    if(active) {
      if(!reasons.size)normalVolume=player.volume;
      reasons.add(reason);
      player.volume=normalVolume*0.1;
    } else {
      reasons.delete(reason);
      if(!reasons.size && normalVolume!==null) {player.volume=normalVolume;normalVolume=null;}
    }
  }
  window.TdqMediaDucking={set};
  const stop=window.afDesktop?.onSpeechActivity?.(active=>{revision++;set(active,'native');});
  const initial=revision;
  window.afDesktop?.speechActivity?.().then(state=>{
    if(revision===initial)set(!!state.active,'native');
  }).catch(()=>{});
  window.addEventListener('beforeunload',()=>stop?.(),{once:true});
})();
