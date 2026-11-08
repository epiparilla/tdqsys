'use strict';
(() => {
  const byId=id=>document.getElementById(id),rows=[];
  const adding=new Set();
  let config={},inventory=[],loading=false,runId=null;
  const status=message=>{byId('giveaway-stock-status').textContent=message;};
  async function request(body) {
    if(!window.afDesktop?.testDrive)throw Error('Open Settings inside TDQSYS.');
    const result=await window.afDesktop.testDrive(body);
    if(!result.ok)throw Object.assign(Error(result.error || 'Stock service is unavailable.'),{status:result.status});
    return result;
  }
  function key() {return 'tdqsys-pending-stock-'+(typeof stateDoc!=='undefined'?stateDoc?.config?.instanceId:'local')+'-'+(runId || 'legacy');}
  function pending() {try{return Object.assign(Object.create(null),JSON.parse(localStorage.getItem(key()) || '{}'));}catch{return Object.create(null);}}
  function addRow(item='',opening='') {
    const tr=document.createElement('tr');
    const first=document.createElement('td'),second=document.createElement('td'),third=document.createElement('td');
    const name=document.createElement('input'),quantity=document.createElement('input'),remove=document.createElement('button'),plus=document.createElement('button'),correct=document.createElement('button');
    name.type='text';name.value=item;name.maxLength=160;name.placeholder='Giveaway item';name.setAttribute('aria-label','Giveaway item');
    quantity.type='number';quantity.min='0';quantity.max='100000000';quantity.step='1';quantity.value=opening;quantity.placeholder='Opening quantity';quantity.setAttribute('aria-label','Beginning balance');
    remove.type=plus.type='button';remove.textContent='Remove';plus.textContent='+';plus.title='Replenish this item';plus.setAttribute('aria-label','Replenish giveaway item');
    const box=document.createElement('div'),amount=document.createElement('input'),commit=document.createElement('button'),cancel=document.createElement('button');
    box.hidden=true;amount.type='number';amount.min='1';amount.max='100000000';amount.step='1';amount.placeholder='Quantity to add';amount.setAttribute('aria-label','Replenishment quantity');
    commit.type=cancel.type='button';commit.textContent='Add stock';cancel.textContent='Cancel';box.appendChild(amount);box.appendChild(commit);box.appendChild(cancel);
    const row={tr,name,quantity,total:third,plus,correct,original:item,box,amount,commit};rows.push(row);
    correct.type='button';correct.textContent='Correct balance / history';correct.onclick=()=>{
      const stock=inventory.find(entry=>entry.item===name.value.trim());
      if(!stock?.initialized || adding.has(name.value.trim()) || pending()[name.value.trim()])return;
      window.TdqGiveawayCorrections.open({kind:'opening',target:stock.item,name:stock.item,expected:stock.opening,instanceId:typeof stateDoc!=='undefined'?stateDoc?.config?.instanceId:'local',runId,request,after:refresh});
    };
    remove.onclick=()=>{rows.splice(rows.indexOf(row),1);tr.remove();};
    plus.onclick=()=>{
      const operation=pending()[row.name.value.trim()];box.hidden=false;
      amount.value=operation?.quantity ?? '';amount.readOnly=!!operation;commit.textContent=operation?`Retry +${operation.quantity}`:'Add stock';amount.focus?.();
    };
    commit.onclick=()=>replenish(row);cancel.onclick=()=>{box.hidden=true;};
    for(const input of [name,quantity,amount])input.style.width='min(100%,240px)';
    for(const element of [remove,plus,commit,cancel,correct]){element.className='btn-ghost settings-btn';element.style.margin='4px';element.style.padding='5px 10px';}
    for(const cell of [first,second,third]){cell.style.padding='7px 6px';cell.style.borderBottom='1px solid #333';}
    first.appendChild(name);first.appendChild(remove);second.appendChild(quantity);second.appendChild(plus);second.appendChild(box);second.appendChild(correct);
    tr.appendChild(first);tr.appendChild(second);tr.appendChild(third);byId('cfg-giveaway-items').appendChild(tr);updateRows();
  }
  function updateRows() {
    for(const row of rows) {
      const stock=inventory.find(entry=>entry.item===row.name.value.trim());
      row.name.readOnly=!!stock?.initialized;
      row.quantity.readOnly=!!stock?.initialized;
      if(stock?.initialized)row.quantity.value=stock.opening;
      row.plus.disabled=!stock?.initialized || row.name.value.trim()!==row.original || adding.has(row.name.value.trim());
      row.commit.disabled=adding.has(row.name.value.trim());
      row.correct.disabled=!stock?.initialized || adding.has(row.name.value.trim()) || !!pending()[row.name.value.trim()] || row.name.value.trim()!==row.original;
      row.total.textContent=stock?String(stock.supplied):'Not yet recorded';
      if(stock && stock.remaining<0)row.total.textContent+=' — opening stock needs reconciliation';
    }
  }
  function hydrate(next) {
    config=next;rows.length=0;byId('cfg-giveaway-items').replaceChildren();
    for(const item of next.giveawayItems || [])addRow(item,(next.giveawayStockOpenings || []).find(entry=>entry.item===item && entry.runId===runId)?.quantity ?? '');
    if(!rows.length)addRow();
    refresh();
  }
  function collect() {
    const giveawayItems=[],giveawayStockOpenings=[],seen=new Set();
    for(const row of rows) {
      const item=row.name.value.trim(),quantity=row.quantity.value;
      if(!item){if(quantity!=='')throw Error('Enter a name for each opening balance.');continue;}
      if(item.length>160 || item.toLocaleLowerCase()==='unclaimed' || seen.has(item.toLocaleLowerCase()))throw Error('Use distinct giveaway names up to 160 characters. Unclaimed is provided automatically.');
      seen.add(item.toLocaleLowerCase());giveawayItems.push(item);
      if(quantity!=='') {
        const amount=Number(quantity);
        if(!Number.isInteger(amount) || amount<0 || amount>100000000)throw Error('Beginning balance must be a whole number from 0 to 100000000.');
        if(!runId)throw Error('Wait for the current giveaway run to load before saving opening quantities.');
        const saved=(config.giveawayStockOpenings || []).find(entry=>entry.item===item && entry.quantity===amount && entry.runId===runId);
        if(!inventory.find(entry=>entry.item===item)?.initialized || saved)giveawayStockOpenings.push(saved || {item,quantity:amount,requestId:crypto.randomUUID(),runId});
      }
    }
    if(giveawayItems.length>200)throw Error('Use at most 200 giveaway items.');
    return {giveawayItems,giveawayStockOpenings};
  }
  async function refresh() {
    if(loading)return;loading=true;
    try {
      const result=await request({action:'giveaway-inventory'});
      if(runId && result.runId!==runId)for(const row of rows){row.quantity.value='';row.box.hidden=true;}
      runId=result.runId;inventory=result.inventory || [];updateRows();
      byId('giveaway-stock-history').replaceChildren();
      for(const event of result.history || []) {
        const tr=document.createElement('tr');
        for(const text of [new Date(event.created_at).toLocaleString(),event.item,event.kind,event.quantity]){const td=document.createElement('td');td.textContent=String(text);tr.appendChild(td);}
        byId('giveaway-stock-history').appendChild(tr);
      }
      status('Current-run stock is up to date. Each new run/daily reset starts at zero. Save new opening quantities for this run; + additions save immediately.');
    } catch(error){status(error.message+' Unsaved item/quantity edits are retained.');}
    finally{loading=false;}
  }
  async function replenish(row) {
    const item=row.name.value.trim(),saved=pending();let operation=saved[item];
    if(adding.has(item))return;
    if(!operation) {
      const quantity=Number(row.amount.value);
      if(!Number.isInteger(quantity) || quantity<1 || quantity>100000000){status('Enter a positive whole-number quantity.');return;}
      operation={action:'giveaway-stock',item,quantity,requestId:crypto.randomUUID(),runId};saved[item]=operation;
      localStorage.setItem(key(),JSON.stringify(saved));
    }
    adding.add(item);row.plus.disabled=true;status('Recording replenishment…');
    try {
      await request(operation);const current=pending();delete current[item];localStorage.setItem(key(),JSON.stringify(current));
      row.box.hidden=true;row.amount.value='';row.amount.readOnly=false;row.commit.textContent='Add stock';
      await refresh();
    } catch(error){row.amount.value=operation.quantity;row.amount.readOnly=true;row.commit.textContent=`Retry +${operation.quantity}`;status(`Addition not confirmed: ${error.message} Retry the same addition; it will not add stock twice.`);}
    finally{adding.delete(item);updateRows();}
  }
  byId('giveaway-add-item').onclick=()=>addRow();byId('giveaway-stock-refresh').onclick=refresh;
  window.TdqGiveawayStock={hydrate,collect};
  if(typeof stateDoc!=='undefined' && stateDoc?.config)hydrate(stateDoc.config.testDrive || {});
  const timer=setInterval(()=>{if(!document.hidden)refresh();},10000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
