'use strict';
(() => {
  const byId=id=>document.getElementById(id),selected=new Set();
  let preview=null,backup=null,busy=false,unconfirmed=false,runs=[];
  const status=text=>{byId('history-status').textContent=text;};
  async function call(body) {
    if(!window.afDesktop?.testDrive)throw Error('Open Event Setup inside TDQSYS.');
    const result=await window.afDesktop.testDrive(body);
    if(!result.ok)throw Object.assign(Error(result.error),{unconfirmed:result.cleanupUnconfirmed});return result;
  }
  function scope(){return {mode:byId('history-mode').value,runIds:[...selected].sort()};}
  function controls() {
    byId('history-mode').disabled=busy || unconfirmed;byId('history-refresh').disabled=busy || unconfirmed;
    byId('history-preview').disabled=busy || unconfirmed || (scope().mode==='selected' && !selected.size);
    byId('history-backup').disabled=busy || unconfirmed || !preview;
    byId('history-confirm').disabled=busy || !backup;
    byId('history-delete').disabled=busy || !backup || byId('history-confirm').value!==preview?.confirmation;
    document.querySelectorAll('#history-run-list input').forEach(input=>{input.disabled=busy || unconfirmed || input.dataset.active==='true' || scope().mode==='clean';});
  }
  function invalidate(){if(unconfirmed)return;preview=null;backup=null;byId('history-summary').textContent='';byId('history-phrase').textContent='the confirmation shown after preview';byId('history-confirm').value='';controls();}
  async function load() {
    if(busy || unconfirmed)return;busy=true;controls();
    try {
      const resume=await call({action:'history-resume'});
      if(resume.pending){backup=resume;preview={confirmation:resume.confirmation,summary:resume.summary};unconfirmed=true;byId('history-mode').value=resume.mode;byId('history-phrase').textContent=resume.confirmation;byId('history-summary').textContent=Object.entries(resume.summary).map(([key,value])=>`${key}: ${value}`).join(' · ');status('A previous cleanup outcome is unconfirmed. Verify the backup, retype the phrase and retry the same action.');return;}
      runs=(await call({action:'history-list'})).runs || [];byId('history-run-list').replaceChildren();
      const closed=new Set(runs.filter(run=>run.status==='closed').map(run=>run.id));for(const id of selected)if(!closed.has(id))selected.delete(id);
      for(const run of runs) {
        const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='checkbox';input.dataset.active=String(run.status==='active');input.checked=selected.has(run.id);
        text.textContent=`${run.day} · Run ${run.number} · ${run.status}${run.reason?' · '+run.reason:''}`;
        input.onchange=()=>{if(input.checked)selected.add(run.id);else selected.delete(run.id);invalidate();};label.appendChild(input);label.appendChild(text);byId('history-run-list').appendChild(label);
      }
      invalidate();
    } catch(error){status(error.message);}finally{busy=false;controls();}
  }
  byId('history-mode').onchange=invalidate;byId('history-refresh').onclick=load;byId('history-confirm').oninput=controls;
  byId('history-preview').onclick=async()=>{
    busy=true;controls();
    try {preview=await call({action:'history-preview',...scope()});backup=null;byId('history-confirm').value='';byId('history-phrase').textContent=preview.confirmation;
      byId('history-summary').textContent=Object.entries(preview.summary).map(([key,value])=>`${key}: ${value}`).join(' · ');status('Review the exact scope, then save a private backup. Nothing has been deleted.');
    } catch(error){status(error.message);}finally{busy=false;controls();}
  };
  byId('history-backup').onclick=async()=>{
    if(!preview)return;busy=true;controls();
    try {const result=await call({action:'history-backup',...scope(),fingerprint:preview.fingerprint});if(result.cancelled){status('Backup cancelled. Nothing was deleted.');return;}
      backup=result;status(`Backup verified: ${result.backupPath}. Type ${preview.confirmation} to enable deletion.`);
    } catch(error){invalidate();status(error.message);}finally{busy=false;controls();}
  };
  byId('history-delete').onclick=async()=>{
    if(!backup || byId('history-confirm').value!==preview?.confirmation)return;busy=true;controls();
    try {
      const result=await call({action:'history-delete',backupId:backup.backupId,confirmation:byId('history-confirm').value});
      unconfirmed=false;const savedPath=result.backupPath;invalidate();
      try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key && (key.startsWith('tdqsys-pending-giveaways-'+result.instanceId) || key.startsWith('tdqsys-pending-stock-'+result.instanceId)) && (result.mode==='clean' || result.deletedRunIds.some(id=>key.endsWith(id))))localStorage.removeItem(key);}}catch{/* Run-bound retry keys cannot affect the fresh run. */}
      status(`TDQSYS cleanup completed. Backup: ${savedPath}. Google Sheets and settings were not changed.`);
      window.dispatchEvent(new Event('tdqsys-history-cleaned'));
    } catch(error){unconfirmed=!!error.unconfirmed;if(!unconfirmed)invalidate();status(error.message);}
    finally{busy=false;controls();if(!unconfirmed && !backup)load();}
  };
  byId('history-cleanup').addEventListener('toggle',()=>{if(byId('history-cleanup').open)load();});controls();
})();
