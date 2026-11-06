'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readPublic}=require('./helpers');
function element(tag='div') {
  return {tag,children:[],style:{},value:'',setAttribute(){},appendChild(child){child.parent=this;this.children.push(child);},
    replaceChildren(...children){this.children=children;},add(child){this.children.push(child);},remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('stock setup has exactly three columns, collects opening plans and locks committed opening quantities',async()=>{
  const html=readPublic('settings.html');
  assert.match(html,/<th>Item<\/th><th>Beginning balance \/ replenish<\/th><th>Total beginning balance<\/th>/);
  const nodes=Object.fromEntries(['giveaway-stock-status','cfg-giveaway-items','giveaway-stock-history','giveaway-add-item','giveaway-stock-refresh'].map(id=>[id,element()]));
  let inventory=[{item:'Cap',initialized:false,supplied:0,remaining:0}];let fail=true,serial=0;
  const calls=[],storage={};
  const context={document:{getElementById:id=>nodes[id],createElement:element},stateDoc:{config:{instanceId:'local',testDrive:{giveawayItems:['Cap']}}},
    crypto:{randomUUID:()=>`request-${++serial}`},localStorage:{getItem:key=>storage[key],setItem:(key,value)=>{storage[key]=value;}},
    setInterval(){},clearInterval(){},window:{addEventListener(){},prompt:()=> '3',confirm:()=>true,
      afDesktop:{testDrive:async body=>{calls.push(body);if(body.action==='giveaway-stock'){if(fail)return {ok:false,error:'Offline'};inventory=[{item:'Cap',initialized:true,opening:10,supplied:13,remaining:13}];}return {ok:true,runId:'run',inventory,history:[]};}}}};
  vm.runInNewContext(readPublic('giveaway-stock-settings.js'),context);await tick();
  const row=nodes['cfg-giveaway-items'].children[0],quantity=row.children[1].children[0],plus=row.children[1].children[1];
  quantity.value='10';const collected=context.window.TdqGiveawayStock.collect();assert.equal(collected.giveawayStockOpenings[0].quantity,10);
  inventory=[{item:'Cap',initialized:true,opening:10,supplied:10,remaining:10}];await nodes['giveaway-stock-refresh'].onclick();
  assert.equal(quantity.readOnly,true);assert.equal(row.children[2].textContent,'10');
  plus.onclick();const box=row.children[1].children[2],amount=box.children[0],commit=box.children[1];amount.value='3';
  await commit.onclick();const first=calls.at(-1);assert.equal(first.quantity,3);assert.match(nodes['giveaway-stock-status'].textContent,/not confirmed/);
  fail=false;await commit.onclick();
  const writes=calls.filter(call=>call.action==='giveaway-stock');assert.equal(writes.length,2);assert.equal(writes[0].requestId,writes[1].requestId);
  assert.equal(row.children[2].textContent,'13');
  nodes['giveaway-add-item'].onclick();const duplicate=nodes['cfg-giveaway-items'].children[1];duplicate.children[0].children[0].value=' cap ';
  assert.throws(()=>context.window.TdqGiveawayStock.collect(),/distinct giveaway names/);
});

test('Live Dashboard renders real summary/table/chart data and requests selected history run without writes',async()=>{
  const ids=['analytics-run','run','analytics-updated','analytics-cards','analytics-models','analytics-inventory','model-chart','giveaway-chart','remaining-chart','message','refresh'];
  const nodes=Object.fromEntries(ids.map(id=>[id,element()])),calls=[];
  const data={runs:[{id:'history',day:'2026-11-05',number:1,status:'closed'}],run:{operating_day:'2026-11-06',run_number:2,status:'active'},registered:4,queuedClients:5,tickets:7,given:3,returned:1,netGiven:2,
    models:[{model:'<model>',registered:5,tickets:7,done:2,noShow:1}],inventory:[{item:'Cap',beginning:10,added:5,issued:3,returned:1,remaining:13}]};
  const context={document:{getElementById:id=>nodes[id],createElement:element,activeElement:null},Option:function(text,value){return {text,value};},setInterval(){},clearInterval(){},
    window:{addEventListener(){},afDesktop:{testDrive:async body=>{calls.push(body);return {ok:true,...data};}}}};
  vm.runInNewContext(readPublic('live-dashboard.js'),context);await tick();
  assert.equal(nodes['analytics-models'].children[0].children[0].textContent,'<model>');
  assert.equal(nodes['analytics-inventory'].children[0].children[5].textContent,'13');
  assert.equal(nodes['analytics-cards'].children[0].children[1].textContent,'4');
  assert.equal(nodes['model-chart'].children.length,2);
  nodes['analytics-run'].value='history';nodes['analytics-run'].onchange();await tick();
  assert.equal(calls.at(-1).runId,'history');assert.ok(calls.every(call=>call.action==='dashboard-snapshot'));
  assert.match(readPublic('facilitator-shell.js'),/href="live-dashboard.html"/);
});
