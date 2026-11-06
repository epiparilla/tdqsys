'use strict';
(() => {
  const byId=id=>document.getElementById(id);
  let loading=false,generation=0,signature='';
  function row(target,values) {
    const tr=document.createElement('tr');
    for(const value of values){const td=document.createElement('td');td.textContent=String(value ?? 0);tr.appendChild(td);}
    target.appendChild(tr);
  }
  function chart(id,title,values) {
    const root=byId(id);root.replaceChildren();
    const heading=document.createElement('h3');heading.textContent=title;root.appendChild(heading);
    const maximum=Math.max(1,...values.map(entry=>Number(entry.value)||0));
    for(const entry of values) {
      const bar=document.createElement('div'),label=document.createElement('span'),track=document.createElement('div'),fill=document.createElement('div'),count=document.createElement('strong');
      bar.className='chart-row';label.textContent=entry.label;count.textContent=String(entry.value ?? 0);
      track.className='chart-track';fill.className='chart-fill';fill.style.width=`${Math.max(0,Number(entry.value)||0)/maximum*100}%`;
      track.appendChild(fill);bar.appendChild(label);bar.appendChild(track);bar.appendChild(count);root.appendChild(bar);
    }
    if(!values.length){const empty=document.createElement('p');empty.textContent='No data for this run.';root.appendChild(empty);}
  }
  function render(data) {
    const selection=byId('analytics-run').value;
    if(document.activeElement!==byId('analytics-run')) {
      byId('analytics-run').replaceChildren(new Option('Current run (live)',''));
      for(const run of data.runs || [])byId('analytics-run').add(new Option(`${run.day} · Run ${run.number} · ${run.status}`,run.id));
      byId('analytics-run').value=selection;
    }
    byId('run').textContent=data.run?`${data.run.operating_day} · Run ${data.run.run_number} · ${data.run.status}`:'No queue runs yet.';
    byId('analytics-updated').textContent=`${data.run?.status==='closed'?'Historical run closing balance':'Live; refreshes every 5 seconds'} · As of ${new Date(data.asOf || Date.now()).toLocaleString()}`;
    // Avoid rebuilding tables/charts for an unchanged poll.
    const next=JSON.stringify([data.run,data.registered,data.queuedClients,data.tickets,data.given,data.returned,data.models,data.inventory]);
    if(next===signature)return;signature=next;
    byId('analytics-cards').replaceChildren();
    for(const [label,value] of [['New registrations',data.registered],['Queued clients',data.queuedClients],['Tickets issued',data.tickets],['Giveaways given',data.given],['Giveaways restored',data.returned],['Net giveaways given',data.netGiven]]) {
      const card=document.createElement('article'),heading=document.createElement('h2'),number=document.createElement('strong');
      heading.textContent=label;number.textContent=String(value || 0);card.appendChild(heading);card.appendChild(number);byId('analytics-cards').appendChild(card);
    }
    byId('analytics-models').replaceChildren();byId('analytics-inventory').replaceChildren();
    for(const model of data.models || [])row(byId('analytics-models'),[model.model,model.registered,model.tickets,model.done,model.noShow]);
    for(const item of data.inventory || [])row(byId('analytics-inventory'),[item.item,item.beginning,item.added,item.issued,item.returned,item.initialized===false?(Number(item.remaining)===0?'0 — opening not recorded':'Opening not recorded'):item.remaining]);
    chart('model-chart','Unique clients',(data.models || []).map(model=>({label:model.model,value:model.registered})));
    chart('giveaway-chart','Units given in this run',(data.inventory || []).map(item=>({label:item.item,value:item.issued})));
    chart('remaining-chart','Remaining stock',(data.inventory || []).filter(item=>item.initialized!==false || Number(item.remaining)===0).map(item=>({label:item.item,value:item.remaining})));
  }
  async function refresh() {
    if(loading)return;loading=true;const version=generation;
    try {
      if(!window.afDesktop?.testDrive)throw Error('Open Live Dashboard inside TDQSYS.');
      const result=await window.afDesktop.testDrive({action:'dashboard-snapshot',runId:byId('analytics-run').value || null});
      if(!result.ok)throw Error(result.error || 'Dashboard unavailable.');
      if(version===generation){render(result);byId('message').textContent='';}
    } catch(error){byId('message').textContent=`${error.message} Last displayed figures are retained.`;}
    finally{loading=false;if(version!==generation)refresh();}
  }
  byId('analytics-run').onchange=()=>{generation++;refresh();};byId('refresh').onclick=refresh;
  refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
