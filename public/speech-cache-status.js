'use strict';
(() => {
  const label=document.getElementById('speech-cache-status');
  if(!label || !window.afDesktop?.testDrive)return;
  let busy=false;
  async function refreshSpeechCacheStatus() {
    if(busy)return;
    busy=true;
    try {
      const result=await window.afDesktop.testDrive({action:'speech-status'});
      if(!result.ok)throw Error(result.error);
      label.textContent=result.mode!=='whole-sentence' ? '' : result.warming
        ? `Preparing whole-sentence audio: ${result.prepared}/${result.prepareTotal}. Unprepared tickets may wait for generation; cached tickets play locally.`
        : result.lastError ? `Local speech: ${result.lastError}`
        : result.prepareTotal ? 'Whole-sentence audio preparation complete for the current batch.' : 'Whole-sentence audio is starting preparation.';
    } catch { label.textContent='Local speech service is starting or unavailable.'; }
    finally { busy=false; }
  }
  refreshSpeechCacheStatus();
  const timer=setInterval(refreshSpeechCacheStatus,3000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
