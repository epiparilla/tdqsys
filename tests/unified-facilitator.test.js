'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {PUBLIC,ROOT,extractFunction} = require('./helpers');
const source = fs.readFileSync(path.join(PUBLIC,'test-drive-operations.js'),'utf8');
const main = fs.readFileSync(path.join(ROOT,'app/main.js'),'utf8');
const shell = fs.readFileSync(path.join(PUBLIC,'facilitator-shell.js'),'utf8');

function element(tag='div') {
  return {tagName:tag,children:[],dataset:{},style:{setProperty(){}},value:'',checked:false,
    setAttribute(){},removeAttribute(){},appendChild(node){this.children.push(node);return node;},add(node){this.children.push(node);},replaceChildren(...nodes){this.children=nodes;},
    querySelectorAll(tag){return this.children.flatMap(node=>[...(node.tagName===tag?[node]:[]),...node.querySelectorAll(tag)]);}};
}
function board(snapshot,brand) {
  const elements = Object.fromEntries(['registration-links','run','sheets-status','board','master-rows','search','history','print-rows','licence-locked','licence-locked-why','brand-controls-title','brand1-link','brand2-link','sales-rows','sales-search','sales-count'].map(id=>[id,element()]));
  const context = {snapshot,byId:id=>elements[id],document:{getElementById:id=>elements[id],documentElement:{style:{setProperty(){}}},body:{dataset:{view:'board',brand},style:{setProperty(){}}},createElement:element,querySelectorAll:()=>[]},Set,Option:function(){return element('option');},licenceStatus:{canWrite:true},busy:false,licenceCanWrite:true};
  vm.createContext(context);
  vm.runInContext(extractFunction(shell,'applyFacilitatorBrand'),context);
  vm.runInContext(['cell','formatTicket','applyLicenceLock','renderBrand','renderSales','renderMaster','render'].map(fn=>extractFunction(source,fn)).join('\n'),context);
  context.render();return elements;
}

test('dashboard is the registration board with separate Master Table and Print Queue routes',()=>{
  for(const [file,view] of [['dashboard.html','board'],['dashboard-brand2.html','board'],['master-table.html','master'],['print-queue.html','prints'],['sales-executives.html','sales'],['event-setup.html','setup']]) {
    const html=fs.readFileSync(path.join(PUBLIC,file),'utf8');
    assert.match(html,new RegExp(`data-view="${view}"`));assert.match(html,/facilitator-shell.js/);assert.match(html,/test-drive-operations.js/);
    assert.doesNotMatch(html,/updateQueue|setQueue|brand-sections/);
  }
  const shell=fs.readFileSync(path.join(PUBLIC,'facilitator-shell.js'),'utf8');
  for(const page of ['dashboard.html','master-table.html','print-queue.html','sales-executives.html','event-setup.html'])assert.ok(shell.includes(`href="${page}"`));
  assert.match(fs.readFileSync(path.join(PUBLIC,'test-drive-operations.html'),'utf8'),/url=dashboard.html/);
});

test('vehicle board renders full name, unique registrant total, inline prefixed ticket/name/status, then four actions',()=>{
  const rendered=board({models:[{id:'rav4',full_name:'Toyota RAV4 Hybrid',display_prefix:'AA'}],entries:[
    {id:'one',registration_id:'client',vehicle_model_id:'rav4',queue_number:7,status:'ongoing',registrations:{full_name:'Juan Dela Cruz'}},
    {id:'two',registration_id:'client',vehicle_model_id:'rav4',queue_number:8,status:'done',registrations:{full_name:'Juan Dela Cruz'}}
  ],printJobs:[],sheetsStatus:{hasUrl:false}});
  const column=rendered.board.children[0];
  assert.equal(column.children[0].textContent,'Toyota RAV4 Hybrid');assert.equal(column.children[1].textContent,'Total registered: 1');
  const entry=column.children[2];assert.equal(entry.children[0].className,'entry-summary');
  assert.deepEqual(entry.children[0].children.map(node=>node.textContent),['AA07','Juan Dela Cruz','On going']);
  assert.deepEqual(entry.children[1].children.map(node=>node.textContent),['Ongoing','Done','No Show','Call Back']);
  assert.match(rendered['sheets-status'].textContent,/remain queued/);
});

function bridge(url,config,fetch) {
  let handler;
  const context={ipcMain:{handle:(_name,fn)=>{handler=fn;}},URL,PORT:8081,BASE_DIR:'isolated',RES_SERVER:'server',SUPABASE_URL:'https://cloud.test',path,AbortSignal,
    registrationSyncStatus:{hasUrl:true},cloudSyncTick:()=>{context.pushed=true;},
    fs:{readFileSync:()=>JSON.stringify({config})},fetch,require:()=>({status:()=>({canWrite:true})})};
  vm.runInNewContext(main.slice(main.indexOf("ipcMain.handle('af:testDrive'"),main.indexOf("ipcMain.handle('af:chooseVideos'")),context);
  return {call:body=>handler({senderFrame:{url}},body),context};
}
const config={instanceId:'isolated',cloudWriterToken:'private',brands:[{key:'toyota',models:[{label:'RAV4',prefix:'AA'},{label:'Camry',prefix:'BB'}]}]};
test('dashboard Ongoing saves the selected model to the TV state and triggers the existing cloud mirror',async()=>{
  let saved;
  const {call,context}=bridge('http://localhost:8081/dashboard.html',config,async(url,options)=>{
    if(url.includes('/functions/'))return Response.json({entry:{queue_number:7},model:{brand_key:'toyota',unit_index:1}});
    if(options?.method==='POST'){saved=JSON.parse(options.body);return Response.json({success:true});}
    return Response.json({config,queues:{toyota:{1:2,2:9}}});
  });
  assert.equal((await call({action:'ongoing',entryId:'client'})).ok,true);
  assert.deepEqual(saved.queues,{toyota:{1:7,2:9}});assert.equal(context.pushed,true);
});

test('Event Setup reset clears every brand on the TV and opens a new run without deleting client history',async()=>{
  let saved;const requests=[];
  const {call,context}=bridge('http://localhost:8081/event-setup.html',config,async(url,options)=>{
    requests.push({url,body:options?.body&&JSON.parse(options.body)});
    if(url.includes('/functions/'))return Response.json({run:{id:'new-run'}});
    if(options?.method==='POST'){saved=JSON.parse(options.body);return Response.json({success:true});}
    return Response.json({config,queues:{brand1:{1:4,2:9},brand2:{1:3}},reannounce:{brand:'brand1',unit:1}});
  });
  const result=await call({action:'reset',reason:'Testing again'});
  assert.equal(result.ok,true);assert.equal(result.run.id,'new-run');
  assert.deepEqual(saved.queues,{brand1:{1:0,2:0},brand2:{1:0}});assert.equal(saved.reannounce,null);assert.equal(context.pushed,true);
  assert.equal(requests[0].body.action,'reset');assert.equal(requests.some(item=>item.body?.action==='delete'),false);
});

test('brand dashboards show only their configured models and expose a second page only when enabled',()=>{
  const snapshot={brands:[{key:'brand1',name:'Toyota',color:'#e00000'},{key:'brand2',name:'Lexus',color:'#ccaa11'}],
    models:[{id:'lexus',brand_key:'brand2',unit_index:1,full_name:'Lexus NX'},{id:'rav4',brand_key:'brand1',unit_index:1,full_name:'Toyota RAV4'}],entries:[],printJobs:[]};
  const first=board(snapshot);assert.equal(first.board.children.length,1);assert.equal(first.board.children[0].children[0].textContent,'Toyota RAV4');
  assert.equal(first['brand-controls-title'].textContent,'Toyota CONTROLS');assert.equal(first['brand2-link'].hidden,false);
  const second=board(snapshot,'brand2');assert.equal(second.board.children.length,1);assert.equal(second.board.children[0].children[0].textContent,'Lexus NX');
  assert.equal(second['brand-controls-title'].textContent,'Lexus CONTROLS');
  const disabled=board({...snapshot,brands:[snapshot.brands[0]]},'brand2');assert.equal(disabled.board.children.length,0);assert.equal(disabled['brand2-link'].hidden,true);
});

test('Print Queue displays the unchanged four-digit SE code in the queue-number column and the SE master list retains dealership',()=>{
  const rendered=board({models:[],entries:[],printJobs:[{kind:'se_code_slip',seCode:'0042',status:'pending',se_daily_checkins:{sales_executives:{name:'Test Executive'}}}],
    seCheckins:[{code:'0042',name:'Test Executive',dealership:'Toyota Dealer',operatingDay:'2026-11-01',expiresAt:'2099-11-02T00:00:00Z'}]});
  assert.equal(rendered['print-rows'].children[0].children[0].textContent,'0042');
  assert.equal(rendered['sales-rows'].children[0].children[0].textContent,'0042');assert.equal(rendered['sales-rows'].children[0].children[2].textContent,'Toyota Dealer');
});

test('SE label is 50 by 30mm with a 36pt code and auto-fits the name without shrinking the code',()=>{
  const context={};vm.createContext(context);vm.runInContext(extractFunction(main,'buildPrintLabelHtml'),context);
  const html=context.buildPrintLabelHtml({kind:'se_code_slip',header:'Long <Executive> Name',value:'0042'});
  assert.match(html,/size:50mm 30mm/);assert.match(html,/\.se-code p\{font-size:36pt/);assert.match(html,/Long &lt;Executive&gt; Name/);assert.match(html,/<p>0042<\/p>/);
  const header={style:{fontSize:'32px'},clientHeight:38,clientWidth:174};const number={style:{fontSize:'36pt'}};
  const name={getBoundingClientRect:()=>({height:parseFloat(header.style.fontSize)*4}),get scrollWidth(){return 174;}};
  header.querySelector=()=>name;context.document={querySelector:tag=>tag==='h1'?header:number,body:{classList:{contains:()=>true}}};
  vm.runInContext(extractFunction(main,'fitPrintLabel'),context);context.fitPrintLabel();
  assert.ok(name.getBoundingClientRect().height<=38);assert.equal(number.style.fontSize,'36pt');
});

test('each facilitator page can read the same location snapshot with configured ticket prefixes',async()=>{
  for(const page of ['dashboard.html','dashboard-brand2.html','master-table.html','print-queue.html','sales-executives.html','event-setup.html']) {
    const {call}=bridge(`http://localhost:8081/${page}`,config,async()=>Response.json({models:[{id:'model',brand_key:'toyota',unit_index:2}],entries:[]}));
    const result=await call({action:'snapshot'});assert.equal(result.ok,true);assert.equal(result.models[0].display_prefix,'BB');
  }
});

test('SE reset never changes TV counters or requests the queue-reset action',async()=>{
  const calls=[];
  const {call,context}=bridge('http://localhost:8081/sales-executives.html',config,async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});return Response.json({deactivated:2});
  });
  assert.equal((await call({action:'reset-sales-executives',confirm:true,reason:'Testing'})).ok,true);
  assert.equal(calls.length,1);assert.equal(calls[0].body.action,'reset-sales-executives');assert.equal(context.pushed,undefined);
});

test('Sheets worker keeps retrying independently of pages and syncs a newly saved destination first',async()=>{
  let savedConfig=JSON.parse(JSON.stringify(config));const calls=[];let fail=true;
  const context={app:{isQuitting:false},engineDown:()=>false,registrationSyncBusy:false,registrationSettingsHash:null,registrationSyncStatus:{},BASE_DIR:'isolated',RES_SERVER:'server',SUPABASE_URL:'https://cloud.test',path,crypto,AbortSignal,
    fs:{readFileSync:()=>JSON.stringify({config:savedConfig})},require:()=>({status:()=>({canWrite:true})}),
    fetch:async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='sync-sheets'&&fail)throw Error('offline');return Response.json({configured:true});}};
  vm.createContext(context);vm.runInContext(extractFunction(main,'buildTestDriveSettings')+'\n'+extractFunction(main,'registrationSyncTick'),context);
  await context.registrationSyncTick();assert.deepEqual(calls.map(c=>c.action),['configure']);
  savedConfig.testDrive={sheetsUrl:'https://docs.google.com/spreadsheets/d/location/edit'};
  await context.registrationSyncTick();assert.deepEqual(calls.map(c=>c.action),['configure','configure','sync-sheets']);
  assert.equal(calls[1].sheetsUrl,savedConfig.testDrive.sheetsUrl);
  fail=false;await context.registrationSyncTick();assert.equal(calls.at(-1).action,'sync-sheets');assert.equal(context.registrationSyncBusy,false);
});
