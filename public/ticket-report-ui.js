'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let snapshot=null,excluded=new Set(),loading=false,exporting=false,dirty=false;
  function table(id,rows,total) {
    const target=el(id);target.replaceChildren();
    for(const row of [...rows,{label:'Total',...total}]) {
      const tr=document.createElement('tr');
      for(const value of [row.label,row.tickets,row.done,row.no_show,row.cancelled,row.waiting,row.ongoing]){const td=document.createElement('td');td.textContent=String(value??0);tr.appendChild(td);}
      target.appendChild(tr);
    }
  }
  function render() {
    if(!snapshot)return;
    const selected=snapshot.runs.filter(r=>excluded.has(r.id)).map(r=>r.id);
    const data=window.TdqTicketReport.summarize(snapshot,selected,el('report-combine').checked);
    el('report-cards').replaceChildren();
    for(const [label,value] of [['Leads / form submissions',data.totals.leads],['Queued clients',data.totals.clients],['Tickets issued',data.totals.tickets],['Done',data.totals.done],['No Show',data.totals.no_show],['Cancelled',data.totals.cancelled],['Waiting',data.totals.waiting],['Ongoing',data.totals.ongoing]]) {
      const card=document.createElement('article'),h=document.createElement('h2'),n=document.createElement('strong');h.textContent=label;n.textContent=String(value);card.appendChild(h);card.appendChild(n);el('report-cards').appendChild(card);
    }
    table('report-dealers',data.dealers,data.totals);table('report-models',data.models,data.totals);table('report-days',data.days,data.totals);
    el('report-run-count').textContent=`(${snapshot.runs.length-selected.length} included, ${selected.length} excluded)`;
    el('report-status').textContent=`Snapshot ${new Date(snapshot.asOf).toLocaleString()} · ${snapshot.timezone}. ${snapshot.pending?'Local queue changes await sync; export is unavailable until refreshed after sync.':'Synchronized backend records. Unsynced changes on another laptop cannot be included.'}${dirty?' Filters changed. Apply period before exporting.':''}`;
    el('report-export').disabled=!!snapshot.pending||dirty||loading||exporting;
  }
  async function refresh() {
    if(loading||exporting)return;
    loading=true;el('report-export').disabled=true;el('report-apply').disabled=true;
    const from=el('report-from').value||null,to=el('report-to').value||null;
    try {
      if(!window.afDesktop?.testDrive)throw Error('Open this report inside the TDQSYS desktop app.');
      const result=await window.afDesktop.testDrive({action:'ticket-report',from,to});
      if(!result.ok)throw Error(result.error||'Reporting unavailable.');
      if((el('report-from').value||null)!==from||(el('report-to').value||null)!==to)return;
      if(!snapshot){try{excluded=new Set(JSON.parse(sessionStorage.getItem(`tdq-report-exclusions-${result.instanceId}`)||'[]'));}catch{excluded=new Set();}}
      snapshot=result;dirty=false;el('report-from').value=result.from;el('report-to').value=result.to;
      el('report-runs').replaceChildren();
      for(const run of result.runs){const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');check.type='checkbox';check.checked=!excluded.has(run.id);text.textContent=` ${run.day} · Run ${run.number} · ${run.status} · ${run.reason}`;check.onchange=()=>{check.checked?excluded.delete(run.id):excluded.add(run.id);try{sessionStorage.setItem(`tdq-report-exclusions-${result.instanceId}`,JSON.stringify([...excluded]));}catch{/* Session persistence is optional. */}render();};label.appendChild(check);label.appendChild(text);el('report-runs').appendChild(label);}
    } catch(error){dirty=true;el('report-status').textContent=`${error.message} Previous figures, if any, are retained but cannot be exported.`;}
    finally {loading=false;el('report-apply').disabled=false;if(!dirty)render();}
  }
  el('report-apply').onclick=refresh;
  for(const id of ['report-from','report-to'])el(id).onchange=()=>{dirty=true;el('report-export').disabled=true;el('report-status').textContent='Reporting period changed. Apply period to update figures and export.';};
  el('report-combine').onchange=render;
  el('report-export').onclick=async()=>{
    if(!snapshot||dirty||loading||exporting||snapshot.pending)return;
    exporting=true;render();
    try {const result=await window.afDesktop.testDrive({action:'export-ticket-report',token:snapshot.token,format:el('report-format').value,excludedRunIds:snapshot.runs.filter(r=>excluded.has(r.id)).map(r=>r.id)});if(!result.ok)throw Error(result.error||'Export failed.');el('report-status').textContent=result.canceled?'Export canceled.':`Ticket data saved: ${result.filePath}`;}
    catch(error){el('report-status').textContent=error.message;}
    finally {exporting=false;el('report-export').disabled=dirty||!!snapshot.pending;}
  };
  refresh();const timer=setInterval(()=>{if(!document.hidden&&!dirty)refresh();},15000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
