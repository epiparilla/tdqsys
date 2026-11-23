'use strict';
(function(root){
  const statuses=['done','no_show','cancelled','waiting','ongoing'];
  function scope(snapshot,excludedRunIds=[]) {
    if(!Array.isArray(excludedRunIds))throw Error('Invalid excluded runs.');
    const allowed=new Set(snapshot.runs.map(r=>r.id));
    if(excludedRunIds.some(id=>!allowed.has(id)))throw Error('A selected run is outside this report. Refresh first.');
    const excluded=new Set(excludedRunIds),included=new Set([...allowed].filter(id=>!excluded.has(id)));
    return {tickets:snapshot.tickets.filter(t=>included.has(t.runId)),leads:snapshot.leads.filter(l=>!l.runId || included.has(l.runId))};
  }
  function modelName(model,combine){return combine?model.replace(/\s+(Black|White)$/i,''):model;}
  function summarize(snapshot,excludedRunIds=[],combine=true) {
    const data=scope(snapshot,excludedRunIds),dealers=new Map(),models=new Map(),days=new Map();
    const bucket=()=>({tickets:0,done:0,no_show:0,cancelled:0,waiting:0,ongoing:0,clients:new Set()});
    const totals=bucket();
    function add(target,t){if(!statuses.includes(t.status))throw Error('Unknown ticket status; report cannot be completed.');target.tickets++;target[t.status]++;target.clients.add(t.registrationId);}
    function group(map,key,t){if(!map.has(key))map.set(key,bucket());add(map.get(key),t);}
    for(const t of data.tickets){add(totals,t);const dealer=String(t.dealership||'Unassigned dealership').trim().replace(/\s+/g,' ');group(dealers,dealer.toLocaleLowerCase(),t);dealers.get(dealer.toLocaleLowerCase()).label ||=dealer;group(models,modelName(t.model,combine),t);group(days,t.day,t);}
    const rows=map=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([label,b])=>({...b,label:b.label||label,clients:b.clients.size}));
    return {totals:{...totals,clients:totals.clients.size,leads:data.leads.length},dealers:rows(dealers),models:rows(models),days:rows(days),tickets:data.tickets};
  }
  const api={scope,summarize,modelName,statuses};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TdqTicketReport=api;
})(typeof window==='object'?window:globalThis);
