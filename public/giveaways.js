'use strict';
(() => {
  const byId=id=>document.getElementById(id);
  let snapshot={registrations:[],giveawayItems:[],inventory:[]},canWrite=false,loading=false,generation=0,signature='';
  let activeId=null,issuing=false,panelSignature='',refreshRequested=false;
  const draft=new Set(),choices=new Map(),manageButtons=new Map();
  const claims=registration=>Array.isArray(registration?.giveawayClaims)?registration.giveawayClaims:registration?.giveawayItem?[registration.giveawayItem]:[];
  function pendingKey(){return 'tdqsys-pending-giveaways-'+(snapshot.instanceId || 'local')+'-'+(snapshot.runId || 'legacy');}
  function pendingBatches(){try{return Object.assign(Object.create(null),JSON.parse(localStorage.getItem(pendingKey()) || '{}'));}catch{return Object.create(null);}}
  function storeBatch(id,batch){const saved=pendingBatches();if(batch)saved[id]=batch;else delete saved[id];localStorage.setItem(pendingKey(),JSON.stringify(saved));}
  function formatTimestamp(value,zone='Asia/Manila') {
    if(!value)return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return String(value);
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type).value;
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }
  async function request(body) {
    if(!window.afDesktop?.testDrive)throw Error('Open Giveaways inside the TDQSYS desktop app.');
    const result=await window.afDesktop.testDrive(body);
    if(!result.ok)throw Object.assign(Error(result.error || 'Giveaway service is unavailable.'),{status:result.status});
    return result;
  }
  async function licence() {
    try {
      const response=await fetch('/api/license');
      if(!response.ok)throw Error('Licence check failed.');
      const state=await response.json();canWrite=!!state.canWrite;
      byId('licence-locked').hidden=canWrite;
      byId('licence-locked-why').textContent=canWrite?'':state.state==='expired'?`This licence expired on ${state.until || 'an unknown date'}.`:'This location is not licensed for changes.';
    } catch {canWrite=false;byId('licence-locked').hidden=false;byId('licence-locked-why').textContent='Cannot verify the licence.';}
    renderPanel();
  }
  function render() {
    if(activeId || issuing){renderPanel();return;}
    const search=byId('giveaway-search').value.trim().toLocaleLowerCase();
    const next=JSON.stringify([snapshot,search,canWrite]);
    if(next===signature)return;
    signature=next;
    const rows=snapshot.registrations.filter(row=>String(row.fullName || '').toLocaleLowerCase().includes(search));
    byId('giveaway-rows').replaceChildren();
    manageButtons.clear();
    const value=field=>field==null?'':String(field);
    for(const registration of rows) {
      const row=document.createElement('tr');
      const fields=[formatTimestamp(registration.submittedAt,snapshot.timezone || 'Asia/Manila'),registration.email,registration.fullName,registration.cityAddress,registration.contactNumber,
        (registration.models || []).join(', '),registration.forApplication,registration.forReservation,registration.se?.name,registration.se?.dealership];
      for(const [index,field] of fields.entries()) {
        const cell=document.createElement('td');
        if(index===1 || index===5) {
          cell.className=index===1?'giveaway-email':'giveaway-units';
          const text=document.createElement('span');text.className='giveaway-clip';text.textContent=value(field);text.title=value(field);cell.appendChild(text);
        } else cell.textContent=value(field);
        row.appendChild(cell);
      }
      const action=document.createElement('td'),list=document.createElement('div'),manage=document.createElement('button');list.className='giveaway-chips';
      for(const item of claims(registration)){const chip=document.createElement('span');chip.className='giveaway-chip';chip.textContent=item;chip.title=item;list.appendChild(chip);}
      if(!claims(registration).length)list.textContent='Unclaimed';
      manage.type='button';manage.textContent='Manage items';manage.setAttribute('aria-label',`Manage giveaways for ${registration.fullName || 'client'}`);
      manage.onclick=()=>openPanel(registration.registrationId);manageButtons.set(registration.registrationId,manage);
      action.appendChild(list);action.appendChild(manage);row.appendChild(action);byId('giveaway-rows').appendChild(row);
    }
    byId('giveaway-count').textContent=`${snapshot.day || 'Today'} · ${rows.length} of ${snapshot.registrations.length} registrations · ${snapshot.registrations.filter(row=>claims(row).length).length} clients with giveaways · ${snapshot.registrations.reduce((sum,row)=>sum+claims(row).length,0)} items issued`;
    byId('run').textContent=snapshot.day?`${snapshot.day} · All registration runs today`:'';
    byId('sheets-status').textContent='Original form submissions are shown independently of Google Sheets delivery.';
    if(!rows.length) {
      const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=11;
      cell.textContent=search?'No matching clients.':'No registrations submitted today.';row.appendChild(cell);byId('giveaway-rows').appendChild(row);
    }
  }
  async function refresh() {
    if(loading){refreshRequested=true;return;}
    loading=true;const version=generation;
    try {
      const result=await request({action:'giveaway-snapshot'});
      if(version!==generation)return;
      const changed=snapshot.runId && result.runId!==snapshot.runId;
      snapshot={...result,registrations:result.registrations || [],giveawayItems:result.giveawayItems || [],inventory:result.inventory || []};
      if(changed && activeId && !issuing){closePanel();byId('message').textContent='A new run started. Giveaway stock and claims reset to zero. Reopen Manage items for the current run.';}
      render();
    } catch(error) {byId('message').textContent=`${error.message} Existing rows are retained; selections require a connection.`;}
    finally {loading=false;if(refreshRequested){refreshRequested=false;refresh();}}
  }
  function openPanel(id) {
    activeId=id;draft.clear();const saved=pendingBatches()[id];for(const item of saved?.items || [])draft.add(item);
    panelSignature='';byId('giveaway-panel-status').textContent=saved?`A previous issue request for ${saved.items.join(', ')} needs confirmation. Retry it with the same request ID.`:'';
    renderPanel();byId('giveaway-dialog').showModal();byId('giveaway-close').focus();
  }
  function updateIssueButton() {
    const pending=pendingBatches()[activeId];
    byId('giveaway-issue').textContent=pending?'Retry pending issue':'Give selected items';
    byId('giveaway-issue').disabled=!canWrite || issuing || (!pending && !draft.size) || !snapshot.registrations.some(row=>row.registrationId===activeId);
    byId('giveaway-close').disabled=issuing;byId('giveaway-choices').disabled=issuing;
  }
  function renderPanel() {
    if(!activeId)return;
    const registration=snapshot.registrations.find(row=>row.registrationId===activeId);
    if(!registration){byId('giveaway-panel-status').textContent='This registration is no longer in today’s list. Close and refresh.';updateIssueButton();return;}
    byId('giveaway-client').textContent=registration.fullName || '';
    const prior=claims(registration),saved=pendingBatches()[activeId];
    const next=JSON.stringify([prior,snapshot.giveawayItems,snapshot.inventory,canWrite,saved]);
    if(next===panelSignature){updateIssueButton();return;}panelSignature=next;
    byId('giveaway-choices').replaceChildren();choices.clear();
    const items=[...new Set([...prior,...snapshot.giveawayItems,...(saved?.items || [])])];
    for(const item of [...draft])if(!snapshot.giveawayItems.includes(item) || prior.includes(item))draft.delete(item);
    for(const item of items) {
      const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
      const issued=prior.includes(item),remaining=snapshot.inventory.find(stock=>stock.item===item)?.remaining || 0;
      input.type='checkbox';input.checked=issued || draft.has(item) || !!saved?.items.includes(item);input.disabled=issued || remaining<=0 || !canWrite || !!saved;
      if(!issued && remaining<=0 && !saved){input.checked=false;draft.delete(item);}
      input.onchange=()=>{if(input.disabled)return;if(input.checked)draft.add(item);else draft.delete(item);updateIssueButton();};
      text.textContent=issued?`${item} — already issued${snapshot.giveawayItems.includes(item)?'':' (removed from setup)'}`:saved?.items.includes(item)?`${item} — pending confirmation`:remaining>0?`${item} — ${remaining} remaining`:`${item} — out of stock`;
      label.appendChild(input);label.appendChild(text);byId('giveaway-choices').appendChild(label);choices.set(item,input);
    }
    if(!items.length){const empty=document.createElement('p');empty.textContent='Configure giveaway items and opening stock in Settings.';byId('giveaway-choices').appendChild(empty);}
    updateIssueButton();
  }
  async function issue() {
    if(!activeId || !canWrite || issuing || byId('giveaway-issue').disabled)return;
    const id=activeId,existing=pendingBatches()[id];
    const batch=existing || {requestId:crypto.randomUUID(),items:[...draft],runId:snapshot.runId};
    if(!batch.items.length)return;
    try {storeBatch(id,batch);}catch{byId('giveaway-panel-status').textContent='Cannot safely save the retry request on this device. No items were issued.';return;}
    generation++;issuing=true;updateIssueButton();
    byId('giveaway-panel-status').textContent='Recording selected items…';
    try {
      const result=await request({action:'issue-giveaways',registrationId:id,items:batch.items,requestId:batch.requestId,runId:batch.runId || snapshot.runId});
      const current=snapshot.registrations.find(row=>row.registrationId===id);
      if(current)current.giveawayClaims=[...new Set([...claims(current),...(result.giveawayClaims || result.issuedItems || batch.items)])];
      storeBatch(id,null);draft.clear();
      byId('giveaway-panel-status').textContent=result.replayed?'This request was already recorded. Check the previous handover before dispensing again.':`Saved ${batch.items.length} new giveaway item(s).`;
    } catch(error) {
      if(error.status>=400 && error.status<500 && error.status!==429){storeBatch(id,null);draft.clear();}
      byId('giveaway-panel-status').textContent=`Not confirmed: ${error.message} Refresh before dispensing. Uncertain requests retain the same safe retry ID.`;
    } finally {generation++;issuing=false;panelSignature='';signature='';renderPanel();refresh();}
  }
  function closePanel(){if(issuing)return;const id=activeId;activeId=null;draft.clear();byId('giveaway-dialog').close();signature='';render();manageButtons.get(id)?.focus();}
  byId('giveaway-issue').onclick=issue;byId('giveaway-close').onclick=closePanel;
  byId('giveaway-dialog').addEventListener('cancel',event=>{event.preventDefault();closePanel();});
  byId('giveaway-search').oninput=render;
  byId('refresh').onclick=async()=>{await licence();await refresh();};
  licence().then(refresh);
  const timer=setInterval(()=>licence().then(refresh),5000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
