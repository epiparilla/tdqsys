'use strict';
(() => {
 const byId=id=>document.getElementById(id);let preview=null,readGeneration=0;
 function download(name,text,type='text/csv'){const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 byId('vehicle-template').onclick=()=>download('tdqsys-car-list-template.csv',window.TdqVehicleImport.stringify([{name:'Example Brand',models:[{label:'Example Vehicle',shortname:'MODEL',shortnamePronounce:'Model',prefix:'AA',pronounce:'A A'}]}]));
 byId('vehicle-export').onclick=()=>download('tdqsys-car-list.csv',window.TdqVehicleImport.stringify(stateDoc.config.brands));
 byId('vehicle-import-file').onchange=async event=>{
  const generation=++readGeneration;preview=null;byId('vehicle-import-apply').disabled=true;byId('vehicle-import-preview').replaceChildren();
  const file=event.target.files[0];if(!file)return;
  try{
   if(!window.afDesktop)throw Error('Import car lists inside desktop Settings.');if(file.size>100000)throw Error('Use a file no larger than 100 KB.');
   const text=await file.text();if(generation!==readGeneration)return;preview=window.TdqVehicleImport.parse(text,stateDoc.config.brands);
   const table=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr'),tbody=document.createElement('tbody');for(const name of window.TdqVehicleImport.headers){const cell=document.createElement('th');cell.textContent=name;head.appendChild(cell);}thead.appendChild(head);table.appendChild(thead);table.appendChild(tbody);
   for(const brand of preview)for(const model of brand.models){const row=document.createElement('tr');for(const text of [brand.name,model.label,model.shortname,model.shortnamePronounce,model.prefix,model.pronounce]){const cell=document.createElement('td');cell.textContent=text;row.appendChild(cell);}tbody.appendChild(row);}
   byId('vehicle-import-preview').appendChild(table);byId('vehicle-import-status').textContent=`Preview: ${preview.length} brand(s), ${preview.reduce((sum,brand)=>sum+brand.models.length,0)} vehicles. Not applied or saved.`;byId('vehicle-import-apply').disabled=false;
  }catch(error){if(generation!==readGeneration)return;preview=null;byId('vehicle-import-status').textContent=error.message;}
 };
 byId('vehicle-import-apply').onclick=()=>{
  if(!unlocked || !preview){byId('vehicle-import-status').textContent='Enter Edit Mode and load a valid file first.';return;}
  if(!window.confirm('Replace the current unsaved brand/car editor contents with this preview? Other Settings stay unchanged. You must still Save and confirm.'))return;
  buildBrandEditors({brands:preview});preview=null;byId('vehicle-import-apply').disabled=true;byId('vehicle-import-status').textContent='Applied to the editor only. Review then Save, or Discard to restore saved settings.';
 };
 let active=false;
 async function call(action,values={}){if(!window.afDesktop?.testDrive)throw Error('Open these testing controls in the desktop app.');const result=await window.afDesktop.testDrive({action,...values});if(!result.ok)throw Error(result.error);return result.simulation;}
 function render(state){active=state.active;byId('simulation-start').disabled=active;byId('simulation-stop').disabled=!active;for(const id of ['simulation-agents','simulation-clients','simulation-confirm'])byId(id).disabled=active;byId('simulation-status').textContent=`${state.phase} | Agents ${state.agents||0}/${state.totalAgents||0} | Clients ${state.clients||0}/${state.totalClients||0} | Tickets ${state.tickets||0}${state.nextSubmissionAt?' | Next: '+new Date(state.nextSubmissionAt).toLocaleTimeString():''}${state.error?' | '+state.error:''}`;byId('simulation-log').textContent=(state.logs||[]).join('\n');}
 async function refresh(){try{render(await call('simulation-status'));}catch(error){byId('simulation-status').textContent=error.message;byId('simulation-start').disabled=true;}}
 byId('simulation-start').onclick=async()=>{
  if(active)return;const agents=Number(byId('simulation-agents').value),clients=Number(byId('simulation-clients').value),confirm=byId('simulation-confirm').checked;
  if(!confirm || !Number.isInteger(agents)||agents<1||agents>10||!Number.isInteger(clients)||clients<1||clients>20){byId('simulation-status').textContent='Select valid counts and acknowledge TEST data first.';return;}
  if(!window.confirm(`Create a marked TEST run and register ${agents} TEST Agents and ${clients} TEST clients at this location?\nReal print-queue jobs and Google Sheets rows will be created. No labels print automatically.\nStop and open a new official run before real registrations.`))return;
  byId('simulation-start').disabled=true;try{render(await call('simulation-start',{agents,clients,confirm:true}));}catch(error){byId('simulation-status').textContent=error.message;byId('simulation-start').disabled=false;}
 };
 byId('simulation-stop').onclick=async()=>{try{render(await call('simulation-stop'));}catch(error){byId('simulation-status').textContent=error.message;}};
 refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},1000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
