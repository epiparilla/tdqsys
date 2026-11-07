'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readPublic}=require('./helpers');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Giveaways keeps raw Sheet columns without a visible registration ID and has a multi-item dialog',()=>{
  const html=readPublic('giveaways.html');
  for(const label of ['Submitted at','Email Address','Name','City Address','Contact No.','Unit to Test Drive','For Application?','For Reservation?','Agent name','Dealership','Giveaway item'])assert.ok(html.includes(`<th>${label}</th>`));
  assert.doesNotMatch(html,/<th>Registration ID<\/th>/);assert.match(html,/<dialog id="giveaway-dialog"/);
  assert.match(readPublic('settings.html'),/id="cfg-giveaway-items"/);assert.match(readPublic('facilitator-shell.js'),/href="giveaways.html"/);
});

function screen(extra={}) {
  function node(tag='div') {return {tag,children:[],dataset:{},value:'',listeners:{},setAttribute(){},appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},
    focus(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(type,fn){this.listeners[type]=fn;}};}
  const ids=['giveaway-rows','giveaway-search','giveaway-count','refresh','licence-locked','licence-locked-why','message','run','sheets-status','giveaway-dialog','giveaway-client','giveaway-choices','giveaway-panel-status','giveaway-issue','giveaway-close'];
  const elements=Object.fromEntries(ids.map(id=>[id,node()]));
  let data=extra.data || {instanceId:'location',day:'2026-11-06',registrations:[{registrationId:'id',fullName:'Client',email:'<script>bad</script>',models:['Car A','Car B'],forApplication:false,giveawayClaims:[]}],
    giveawayItems:['Cap','Tote','Empty'],inventory:[{item:'Cap',remaining:3},{item:'Tote',remaining:5},{item:'Empty',remaining:0}]};
  data={runId:'run',...data};
  let failed=extra.failSave,serial=0;
  const calls=[],storage=extra.storage || {};
  const context={document:{getElementById:id=>elements[id],createElement:node},localStorage:{getItem:key=>storage[key],setItem:(key,value)=>{storage[key]=value;}},crypto:{randomUUID:()=>`request-${++serial}`},
    window:{addEventListener(){},afDesktop:{testDrive:async body=>{
      calls.push(body);
      if(body.action==='issue-giveaways') {
        if(failed)return {ok:false,error:'Connection lost',status:extra.failStatus};
        const registration=data.registrations.find(row=>row.registrationId===body.registrationId);
        registration.giveawayClaims=[...new Set([...(registration.giveawayClaims || []),...body.items])];
        return {ok:true,giveawayClaims:registration.giveawayClaims,issuedItems:body.items};
      }
      return {ok:true,...structuredClone(data)};
    }}},fetch:async()=>Response.json({canWrite:extra.canWrite!==false}),setInterval:()=>1,clearInterval(){}};
  vm.runInNewContext(readPublic('giveaways.js'),context);
  const open=()=>elements['giveaway-rows'].children[0].children[10].children[1].onclick();
  const choice=item=>elements['giveaway-choices'].children.find(label=>label.children[1]?.textContent.startsWith(item+' —'))?.children[0];
  function select(item){const input=choice(item);assert.ok(input);assert.equal(input.disabled,false);input.checked=true;input.onchange();}
  return {elements,calls,context,storage,open,choice,select,setFailure:value=>{failed=value;},setData:next=>{data={runId:'run',...next};}};
}

test('one raw row supports multiple distinct items, explicit commit and a locked claimed state',async()=>{
  const ui=screen();await tick();const row=ui.elements['giveaway-rows'].children[0];
  assert.equal(ui.elements['giveaway-rows'].children.length,1);assert.equal(row.children[5].children[0].textContent,'Car A, Car B');assert.equal(row.children[1].children[0].textContent,'<script>bad</script>');
  assert.equal(row.children[10].children[0].textContent,'Unclaimed');ui.open();
  assert.equal(ui.choice('Empty').disabled,true);assert.equal(ui.elements['giveaway-issue'].disabled,true);
  ui.select('Cap');ui.select('Tote');assert.equal(ui.calls.filter(call=>call.action==='issue-giveaways').length,0);
  await ui.elements['giveaway-issue'].onclick();await tick();
  const write=ui.calls.find(call=>call.action==='issue-giveaways');assert.deepEqual(Array.from(write.items),['Cap','Tote']);assert.equal(write.registrationId,'id');assert.equal(write.runId,'run');
  for(const item of ['Cap','Tote']){assert.equal(ui.choice(item).checked,true);assert.equal(ui.choice(item).disabled,true);}
  assert.equal(ui.elements['giveaway-issue'].disabled,true);
  ui.elements['giveaway-close'].onclick();
  const chips=ui.elements['giveaway-rows'].children[0].children[10].children[0];assert.deepEqual(chips.children.map(chip=>chip.textContent),['Cap','Tote']);
});

test('Giveaways uses dd/mm/yyyy hh:mm:ss in location timezone and clips text without discarding it',async()=>{
  const data={day:'2026-11-06',timezone:'Asia/Manila',registrations:[{registrationId:'id',submittedAt:'2026-11-05T16:00:05Z',fullName:'Client',email:'long-address@example.test',models:['Car A','Car B']}],giveawayItems:[]};
  const {elements}=screen({data});await tick();const row=elements['giveaway-rows'].children[0];
  assert.equal(row.children[0].textContent,'06/11/2026 00:00:05');
  for(const [index,text] of [[1,'long-address@example.test'],[5,'Car A, Car B']]){const span=row.children[index].children[0];assert.equal(span.textContent,text);assert.equal(span.title,text);assert.equal(span.className,'giveaway-clip');}
  assert.match(readPublic('facilitator.css'),/giveaway-email \.giveaway-clip\{width:128px/);
});

test('uncertain batch failure preserves its request across retry and never reports a confirmed claim',async()=>{
  const ui=screen({failSave:true});await tick();ui.open();ui.select('Cap');await ui.elements['giveaway-issue'].onclick();await tick();
  assert.match(ui.elements['giveaway-panel-status'].textContent,/Not confirmed/);assert.equal(ui.elements['giveaway-issue'].textContent,'Retry pending issue');
  ui.setFailure(false);await ui.elements['giveaway-issue'].onclick();await tick();
  const writes=ui.calls.filter(call=>call.action==='issue-giveaways');assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);
});

test('definite server rejection releases the batch and retired legacy claims remain checked/locked',async()=>{
  const ui=screen({failSave:true,failStatus:409});await tick();ui.open();ui.select('Cap');await ui.elements['giveaway-issue'].onclick();await tick();
  assert.equal(ui.elements['giveaway-issue'].textContent,'Give selected items');assert.equal(ui.elements['giveaway-issue'].disabled,true);
  const legacy=screen({data:{day:'2026-11-06',registrations:[{registrationId:'id',fullName:'Client',models:[],giveawayItem:'Old item'}],giveawayItems:['Cap'],inventory:[{item:'Cap',remaining:1}]}});
  await tick();legacy.open();assert.equal(legacy.choice('Old item').checked,true);assert.equal(legacy.choice('Old item').disabled,true);
});

test('polling preserves draft checkboxes and unlicensed users cannot issue',async()=>{
  const ui=screen();await tick();ui.open();ui.select('Cap');await ui.elements.refresh.onclick();
  assert.equal(ui.choice('Cap').checked,true);
  const readonly=screen({canWrite:false});await tick();readonly.open();assert.equal(readonly.choice('Cap').disabled,true);assert.equal(readonly.elements['giveaway-issue'].disabled,true);
});

test('pending requests remain visible even if stock changes or the item is retired before confirmation',async()=>{
  const ui=screen({failSave:true});await tick();ui.open();ui.select('Cap');await ui.elements['giveaway-issue'].onclick();await tick();
  ui.setData({instanceId:'location',day:'2026-11-06',registrations:[{registrationId:'id',fullName:'Client',giveawayClaims:[]}],giveawayItems:['Tote'],inventory:[]});
  await ui.elements.refresh.onclick();assert.equal(ui.choice('Cap').checked,true);assert.equal(ui.choice('Cap').disabled,true);
  assert.equal(ui.elements['giveaway-issue'].textContent,'Retry pending issue');
});

test('run change closes an old issue draft and shows current-run Unclaimed without replaying old requests',async()=>{
  const ui=screen({failSave:true});await tick();ui.open();ui.select('Cap');await ui.elements['giveaway-issue'].onclick();await tick();
  ui.setData({instanceId:'location',runId:'new-run',day:'2026-11-06',registrations:[{registrationId:'id',fullName:'Client',giveawayClaims:[]}],giveawayItems:['Cap'],inventory:[{item:'Cap',remaining:0}]});
  await ui.elements.refresh.onclick();assert.equal(ui.elements['giveaway-dialog'].open,false);
  assert.equal(ui.elements['giveaway-rows'].children[0].children[10].children[0].textContent,'Unclaimed');
  ui.open();assert.equal(ui.elements['giveaway-issue'].textContent,'Give selected items');assert.equal(ui.elements['giveaway-issue'].disabled,true);
});
