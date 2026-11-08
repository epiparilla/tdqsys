'use strict';
// Explicit, audited contingency only. Normal issue/stock controls stay locked.
window.TdqGiveawayCorrections={open:async function(options){
  if(document.getElementById('giveaway-correction-dialog'))return;
  const dialog=document.createElement('dialog');dialog.id='giveaway-correction-dialog';
  Object.assign(dialog.style,{margin:'auto',width:'min(620px,calc(100vw - 32px))',maxHeight:'85vh',overflow:'auto',padding:'20px',background:'#111',color:'#fff',border:'2px solid #d99a32',borderRadius:'10px'});
  const add=(tag,text,parent=dialog)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(tag==='label')Object.assign(node.style,{display:'block',margin:'12px 0'});if(['input','textarea'].includes(tag))node.style.margin='6px';if(tag==='p')Object.assign(node.style,{margin:'12px 0',fontSize:'13px',lineHeight:'1.5',overflowWrap:'anywhere'});if(tag==='button')node.style.margin='6px';parent.appendChild(node);return node;};
  const title=add('h2','Correct '+(options.kind==='opening'?'beginning balance':'recorded giveaway items'));title.id='giveaway-correction-title';dialog.setAttribute('aria-labelledby',title.id);
  add('p',options.name);add('p','Contingency correction only. Verify the physical stock/handover first. Unchecking an item restores one unit; check replacements only if actually given. Every change records your name, reason and before/after values. Closed runs cannot be changed.');
  const fields=add('fieldset');add('legend','Correct values',fields);
  const inputs=[];let quantity;
  if(options.kind==='claims')for(const item of [...new Set([...options.expected,...options.items])]){
    const label=add('label',undefined,fields),input=add('input',undefined,label);input.type='checkbox';input.checked=options.expected.includes(item);input.value=item;label.appendChild(document.createTextNode(' '+item));inputs.push(input);
  }else{const label=add('label','Correct beginning balance',fields);quantity=add('input',undefined,label);quantity.type='number';quantity.min='0';quantity.max='100000000';quantity.step='1';quantity.value=options.expected;}
  const operatorLabel=add('label','Your name',fields),operator=add('input',undefined,operatorLabel);operator.maxLength=120;operator.required=true;
  const reasonLabel=add('label','Reason for correction',fields),reason=add('textarea',undefined,reasonLabel);reason.maxLength=500;reason.minLength=3;reason.required=true;reason.rows=3;
  const confirmLabel=add('label',undefined,fields),confirm=add('input',undefined,confirmLabel);confirm.type='checkbox';confirmLabel.appendChild(document.createTextNode(' I verified the actual handover/stock and reviewed this correction.'));
  const status=add('p');status.setAttribute('role','status');
  const save=add('button','Review and save correction'),close=add('button','Close');save.type=close.type='button';
  const history=add('details');add('summary','Correction history (latest 200)',history);const historyRows=add('div',undefined,history);
  const pendingKey=`tdqsys-pending-giveaways-${options.instanceId}-correction-${options.kind}-${options.target}-${options.runId}`;
  let pending,busy=false,blocked=false;
  try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{status.textContent='Cannot load safe retry storage. Close and check browser storage.';blocked=true;}
  function controls(){fields.disabled=busy || !!pending || blocked;save.disabled=busy || blocked;close.disabled=busy;save.textContent=pending?'Retry same correction':'Review and save correction';}
  if(pending){status.textContent='An earlier correction needs confirmation. Retry the same operation; do not make another correction yet.';operator.value=pending.operator;reason.value=pending.reason;if(quantity)quantity.value=pending.value;else for(const input of inputs)input.checked=pending.value.includes(input.value);}
  function dismiss(){if(busy)return;dialog.close();dialog.remove();}
  close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  save.onclick=async()=>{
    if(busy||blocked)return;
    if(!pending){
      const value=quantity?Number(quantity.value):inputs.filter(input=>input.checked).map(input=>input.value);
      if(!operator.value.trim() || reason.value.trim().length<3 || !confirm.checked || (quantity && (quantity.value==='' || !Number.isInteger(value) || value<0 || value>100000000))){status.textContent='Enter your name, a reason (at least 3 characters), valid values and the confirmation check.';return;}
      const format=value=>Array.isArray(value)?value.join(', ')||'Unclaimed':String(value);
      if(!window.confirm(`Save correction for ${options.name}?\nBefore: ${format(options.expected)}\nAfter: ${format(value)}\nReason: ${reason.value.trim()}\nThis changes recorded stock and is kept in history.`))return;
      pending={action:'giveaway-correct',kind:options.kind,target:options.target,expected:options.expected,value,operator:operator.value.trim(),reason:reason.value.trim(),confirm:true,requestId:crypto.randomUUID(),runId:options.runId};
      try{localStorage.setItem(pendingKey,JSON.stringify(pending));}catch{pending=null;status.textContent='Cannot save safe retry information. Nothing was changed.';return;}
    }
    busy=true;controls();status.textContent='Saving audited correction...';
    try{
      const result=await options.request(pending);localStorage.removeItem(pendingKey);pending=null;
      try{await options.after();}catch{window.alert('Correction saved. Refresh the page to load the updated totals.');}busy=false;dismiss();
    }catch(error){
      if(error.status>=400 && error.status<500 && error.status!==429){localStorage.removeItem(pendingKey);pending=null;blocked=true;status.textContent=error.message+' Close and refresh before reviewing a new correction.';}
      else status.textContent='Outcome unconfirmed: '+error.message+' Retry the same correction; it will not apply twice.';
    }finally{busy=false;controls();}
  };
  document.body.appendChild(dialog);controls();dialog.showModal();close.focus();
  try{
    const result=await options.request({action:'giveaway-correction-history',kind:options.kind,target:options.target,runId:options.runId});
    if(!result.history?.length)add('p','No corrections for this item/client in this run.',historyRows);
    for(const row of result.history||[]){const request=row.details.request,result=row.details.result;add('p',`${new Date(row.created_at).toLocaleString()} | ${row.actor_id} | ${JSON.stringify(result.before)} -> ${JSON.stringify(result.after)} | ${request.reason}`,historyRows);}
  }catch(error){add('p','History unavailable: '+error.message,historyRows);}
}};
