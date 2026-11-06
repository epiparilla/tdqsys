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
  const elements = Object.fromEntries(['registration-links','run','sheets-status','board','master-rows','search','history','print-rows','print-search','master-sort','master-direction','sales-sort','sales-direction','licence-locked','licence-locked-why','brand-controls-title','brand1-link','brand2-link','sales-rows','sales-search','sales-count'].map(id=>[id,element()]));
  const context = {snapshot:{brands:[{key:'brand1',name:'Test',color:'#abc123'}],...snapshot},boardSignature:'',boardViewportWidth:-1,boardScrollFrame:null,boardScrollTarget:null,registrationLinksSignature:'',boardCycleWidth:0,boardDrag:null,selectedModels:new Map(),byId:id=>elements[id],document:{getElementById:id=>elements[id],documentElement:{style:{setProperty(){}}},body:{dataset:{view:'board',brand},style:{setProperty(){}}},createElement:element,querySelectorAll:()=>[]},Set,Option:function(){return element('option');},licenceStatus:{canWrite:true},busy:false,licenceCanWrite:true};
  vm.createContext(context);
  vm.runInContext(extractFunction(shell,'applyFacilitatorBrand'),context);
  vm.runInContext(['cell','sortedRows','formatTicket','loopPosition','flushBoardScroll','applyLicenceLock','renderBrand','createBoardColumn','renderBoard','renderSales','renderMaster','renderPrints','render'].map(fn=>extractFunction(source,fn)).join('\n'),context);
  context.render();elements.rerender=context.render;elements.renderPrints=context.renderPrints;elements.context=context;return elements;
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

function bridge(url,config,fetch,extra={}) {
  let handler;
  const context={ipcMain:{handle:(_name,fn)=>{handler=fn;}},URL,PORT:8081,BASE_DIR:'isolated',RES_SERVER:'server',SUPABASE_URL:'https://cloud.test',path,AbortSignal,
    getLocalQueue:()=>({barrier:async()=>{},sync:async()=>{},remoteBusy:false}),
    localQueueAction:async body=>{context.localRequest=body;return {ok:true,localSaved:true};},
    dispatchLocalQueueAction:(body,cfg)=>context.localQueueAction(body,cfg),
    registrationSyncStatus:{hasUrl:true},queueTicketSpeech:async()=>({speechQueued:true,speechPreparing:false}),cloudSyncTick:()=>{context.pushed=true;},
    fs:{readFileSync:()=>JSON.stringify({config})},fetch,require:()=>({status:()=>({canWrite:true})}),...extra};
  vm.runInNewContext(main.slice(main.indexOf("ipcMain.handle('af:testDrive'"),main.indexOf("ipcMain.handle('af:chooseVideos'")),context);
  return {call:body=>handler({senderFrame:{url},sender:{getPrintersAsync:async()=>[{name:'B1'}]}},body),context};
}
const config={instanceId:'isolated',cloudWriterToken:'private',brands:[{key:'toyota',models:[{label:'RAV4',prefix:'AA'},{label:'Camry',prefix:'BB'}]}]};

test('history cleanup is exposed only on licensed Event Setup and cannot bypass native backup handling',async()=>{
  let handled=0;
  const extra={getHistoryCleanup:()=>({handle:async()=>{handled++;return {ok:true};}})};
  assert.equal((await bridge('http://localhost:8081/event-setup.html',config,async()=>Response.json({}),extra).call({action:'history-preview'})).ok,true);
  for(const page of ['dashboard.html','settings.html'])assert.equal((await bridge(`http://localhost:8081/${page}`,config,async()=>Response.json({}),extra).call({action:'history-delete'})).ok,false);
  assert.equal((await bridge('http://localhost:8081/event-setup.html',config,async()=>Response.json({}),{...extra,require:()=>({status:()=>({canWrite:false})})}).call({action:'history-delete'})).ok,false);
  assert.equal((await bridge('http://localhost:8081/event-setup.html',config,async()=>Response.json({}),extra).call({action:'cleanup-apply'})).ok,false);
  assert.equal(handled,1);
});

test('Giveaways permits licensed selection writes, but unlicensed access is read only',async()=>{
  let writes=0;
  const {call}=bridge('http://localhost:8081/giveaways.html',config,async()=>{writes++;return Response.json({registrations:[]});},
    {require:()=>({status:()=>({canWrite:false})})});
  assert.equal((await call({action:'giveaway-snapshot'})).ok,true);
  assert.equal(writes,1);
  for(const action of ['set-giveaway','issue-giveaways'])assert.equal((await call({action,registrationId:'client',item:'Cap',expectedItem:null})).ok,false);
  assert.equal(writes,1);
});

test('stock Settings and Live Dashboard allow reads but refuse unlicensed stock writes',async()=>{
  for(const [page,action] of [['settings.html','giveaway-inventory'],['live-dashboard.html','dashboard-snapshot']]) {
    let calls=0;
    const {call}=bridge(`http://localhost:8081/${page}`,config,async()=>{calls++;return Response.json({inventory:[]});},{require:()=>({status:()=>({canWrite:false})})});
    assert.equal((await call({action})).ok,true);assert.equal(calls,1);
    assert.equal((await call({action:'giveaway-stock',item:'Cap',quantity:1,requestId:'test'})).ok,false);assert.equal(calls,1);
  }
});

test('speech preparation status uses authenticated local service from Settings or facilitator pages',async()=>{
  for(const page of ['settings.html','dashboard.html']) {
    const calls=[];
    const {call}=bridge(`http://localhost:8081/${page}`,config,async(url,options)=>{
      calls.push({url,options});return Response.json({mode:'whole-sentence',warming:true,prepared:2,prepareTotal:100});
    },{TTS_PORT:8001,TTS_PLAYBACK_TOKEN:'local-only'});
    const result=await call({action:'speech-status'});
    assert.equal(result.ok,true);assert.equal(result.prepared,2);
    assert.equal(calls[0].url,'http://127.0.0.1:8001/api/speech-status');
    assert.equal(calls[0].options.headers['X-TDQSYS-Playback'],'local-only');
    assert.equal(JSON.stringify(result).includes('local-only'),false);
  }
});
test('Settings announcement preview stays on authenticated loopback and returns WAV without a cloud action',async()=>{
  const calls=[];
  const {call}=bridge('http://localhost:8081/settings.html',config,async(url,options)=>{
    calls.push({url,options});return new Response(Buffer.from('RIFFtest'),{headers:{'X-TDQSYS-Voice':'am_liam'}});
  },{Buffer,TTS_PORT:8001,TTS_PLAYBACK_TOKEN:'private-test-token'});
  const result=await call({action:'speech-preview',preview:{kind:'callback',voice:'am_liam',number:1}});
  assert.equal(result.ok,true);assert.equal(Buffer.from(result.audioBase64,'base64').toString(),'RIFFtest');
  assert.equal(result.voice,'am_liam');assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:8001/api/preview-ticket');
  assert.equal(calls[0].options.headers['X-TDQSYS-Playback'],'private-test-token');assert.equal(JSON.parse(calls[0].options.body).kind,'callback');
  assert.equal(JSON.stringify(result).includes('private-test-token'),false);
});
test('announcement preview uses unsaved Settings through native stitched playback instead of a full-sentence request',async()=>{
  const speech=fs.readFileSync(path.join(PUBLIC,'settings-speech.js'),'utf8');
  const requests=[],played=[];let paused=false;
  const values={'speech-test-status':{},'cfg-callback-prefix':{value:'Now serving'},'cfg-callback-suffix':{value:'please approach'}};
  const model={label:'Coolray',prefix:'CRY',pronounce:'C R Y',shortnamePronounce:'Cool ray'};
  const ctx={audio:{pause(){paused=true;}},$:id=>values[id],selected:()=>({voice:'am_liam',prefix:'Unsaved prefix',template:'{ticket}',suffix:'Thank you'}),sampleTicket:()=>({service:'GEELY',model}),
    window:{afDesktop:{testDrive:async body=>{requests.push(body);return {ok:true,audioBase64:'UklGRg=='};}}},Audio:function(src){this.play=async()=>played.push(src);this.pause=()=>{};}};
  vm.createContext(ctx);vm.runInContext(['announcementPreview','playAnnouncement'].map(fn=>extractFunction(speech,fn)).join('\n'),ctx);
  await ctx.playAnnouncement('ongoing');
  assert.equal(requests[0].action,'speech-preview');assert.equal(requests[0].preview.prefix,'Unsaved prefix');assert.equal(requests[0].preview.voice,'am_liam');
  assert.equal(requests[0].preview.model.pronounce,'C R Y');assert.equal(requests[0].preview.number,1);assert.equal(paused,true);
  assert.equal(played[0],'data:audio/wav;base64,UklGRg==');
  await ctx.playAnnouncement('callback');assert.equal(requests[1].preview.kind,'callback');assert.equal(requests[1].preview.callbackSuffix,'please approach');
});
test('Master reprint validates the printer before issuing, then claims and spools the exact returned job',async()=>{
  const calls=[];let printedHtml='',accepted=true;
  class PrintWindow {
    constructor(){this.webContents={executeJavaScript:async()=>{},print:(_options,done)=>done(accepted,'Printer unavailable')};}
    async loadURL(url){printedHtml=decodeURIComponent(url);}
    destroy(){}
  }
  const {call}=bridge('http://localhost:8081/master-table.html',config,async(_url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    if(body.action==='reissue')return Response.json({jobId:'new-job',entryId:'new-entry',queueNumber:5,reprint:false});
    if(body.action==='claim-print')return Response.json({label:{kind:'client_ticket',brandKey:'toyota',unit:1,queueNumber:5,header:'RAV4'}});
    return Response.json({saved:true});
  },{BrowserWindow:PrintWindow,buildPrintLabelHtml:label=>label.header+' '+label.value,formatClientLabel:vm.runInNewContext('('+extractFunction(main,'formatClientLabel')+')'),fitPrintLabel:()=>{}});
  const result=await call({action:'reissue',entryId:'old-entry',printNow:true,printerName:'B1'});
  assert.equal(result.ok,true);assert.equal(result.printed,true);assert.equal(result.issuedTicket.queueNumber,5);
  assert.deepEqual(calls.map(body=>body.action),['reissue','claim-print','print-result']);
  assert.equal(calls[1].jobId,'new-job');assert.equal(calls[2].jobId,'new-job');assert.match(printedHtml,/AA05/);
  accepted=false;calls.length=0;
  const failed=await call({action:'reissue',entryId:'old-entry',printNow:true,printerName:'B1'});
  assert.equal(failed.ok,false);assert.match(failed.error,/Ticket is saved/);
  assert.equal(calls[2].status,'failed');assert.equal(calls[2].jobId,'new-job');
  calls.length=0;
  assert.equal((await call({action:'reissue',entryId:'old-entry',printNow:true,printerName:'missing'})).ok,false);
  assert.equal(calls.length,0);
});

test('infinite queue scrolling preserves its fractional phase across either seam and arbitrarily large movement',()=>{
  const loop=vm.runInNewContext('('+extractFunction(source,'loopPosition')+')');
  assert.equal(loop(1999.5,1000),1999.5);assert.equal(loop(2000.5,1000),1000.5);
  assert.equal(loop(999.5,1000),1999.5);assert.equal(loop(-2300,1000),1700);assert.equal(loop(9300,1000),1300);assert.equal(loop(120,0),120);
});
test('resize before the first snapshot keeps local branding and unchanged snapshots preserve live columns',()=>{
  const rendered=board({models:[],entries:[],printJobs:[]});
  const ctx=rendered.context;let color;
  ctx.document.documentElement.style.setProperty=(_key,value)=>{color=value;};
  ctx.window={TDQSYS_FACILITATOR_BOOTSTRAP:{brands:[{key:'brand1',name:'GEELY',color:'#00B5E2'}]}};
  ctx.snapshot={models:[],entries:[],printJobs:[]};ctx.renderBoard();
  assert.equal(color,'#00B5E2');assert.equal(rendered['brand-controls-title'].textContent,'GEELY CONTROLS');
  const columns=rendered.board.children;ctx.renderBoard();assert.equal(rendered.board.children,columns);
  ctx.snapshot.entries=[{id:'new',status:'waiting'}];ctx.renderBoard();assert.notEqual(rendered.board.children,columns);
});
test('wheel input accumulates into one frame and scrolls by the complete requested distance',()=>{
  const frames=new Map();let counter=0;const board={scrollLeft:1500};
  const ctx={boardCycleWidth:1000,boardScrollTarget:null,boardScrollFrame:null,byId:()=>board,requestAnimationFrame:fn=>{frames.set(++counter,fn);return counter;},cancelAnimationFrame:id=>frames.delete(id)};
  vm.createContext(ctx);vm.runInContext(['loopPosition','scrollBoard','scheduleBoardPosition','flushBoardScroll'].map(fn=>extractFunction(source,fn)).join('\n'),ctx);
  ctx.scrollBoard(10);ctx.scrollBoard(20);ctx.scrollBoard(-5);
  assert.equal(frames.size,1);assert.equal(board.scrollLeft,1500);
  [...frames.values()][0]();assert.equal(board.scrollLeft,1525);assert.equal(ctx.boardScrollTarget,null);
});

test('overflowing queue boards repeat live columns on both sides and retain phase through refresh and resize',()=>{
  const rendered=board({brands:[{key:'brand1',name:'Test'}],models:Array.from({length:4},(_,n)=>({id:String(n),brand_key:'brand1',unit_index:n+1,full_name:`Model ${n}`})),entries:[{id:'client-ticket',vehicle_model_id:'0',status:'waiting',queue_number:1}],printJobs:[]});
  const ctx=rendered.context;
  let width=520.25;
  ctx.document.createElement=tag=>({...element(tag),getBoundingClientRect:()=>({width})});
  rendered.board.clientWidth=1500;ctx.renderBoard();
  assert.equal(rendered.board.children.length,12);
  const cycle=4*(width+12);assert.equal(ctx.boardCycleWidth,cycle);assert.equal(rendered.board.scrollLeft,cycle);
  assert.deepEqual(rendered.board.children.map(column=>column.dataset.modelId),['0','1','2','3','0','1','2','3','0','1','2','3']);
  const actions=[];ctx.mutate=body=>actions.push(body);
  rendered.board.children[8].children[2].children[1].children[0].onclick();
  assert.equal(actions.length,1);assert.equal(actions[0].action,'ongoing');assert.equal(actions[0].entryId,'client-ticket');
  rendered.board.scrollLeft=cycle+267.125;ctx.renderBoard();assert.equal(rendered.board.scrollLeft,cycle+267.125);
  const before=rendered.board.children;ctx.boardDrag={id:1};ctx.renderBoard();assert.equal(rendered.board.children,before);ctx.boardDrag=null;
  width=600;rendered.board.clientWidth=1600;ctx.renderBoard();assert.ok(Math.abs((rendered.board.scrollLeft-ctx.boardCycleWidth)/ctx.boardCycleWidth-267.125/cycle)<1e-8);
  rendered.board.clientWidth=3000;ctx.renderBoard();assert.equal(ctx.boardCycleWidth,0);assert.equal(rendered.board.children.length,4);
  assert.doesNotMatch(shell,/board-previous|board-next|board-navigation/);
  const css=fs.readFileSync(path.join(PUBLIC,'facilitator.css'),'utf8');assert.match(css,/scrollbar-width:none/);assert.match(css,/#board::-webkit-scrollbar\{display:none\}/);
});

test('table sorting compares names case-insensitively and numbers naturally in either direction',()=>{
  const sort=vm.runInNewContext('('+extractFunction(source,'sortedRows')+')');
  const rows=[{name:'Zoe',code:'0010'},{name:'ana',code:'0002'}];
  assert.equal(sort(rows,'name','asc',(item,key)=>item[key])[0].name,'ana');
  assert.equal(sort(rows,'code','desc',(item,key)=>item[key])[0].code,'0010');
  assert.equal(rows[0].name,'Zoe');
});

test('model selection and board scroll survive snapshot rendering, and a focused model selector is retained',()=>{
  const rendered=board({models:[{id:'model',full_name:'Model'}],entries:[{id:'entry',vehicle_model_id:'model',queue_number:1,status:'waiting',registrations:{full_name:'Client'}}],printJobs:[]});
  let selection=rendered['master-rows'].children[0].children[5].children[1];
  selection.value='model';selection.onchange();rendered.board.scrollLeft=270;rendered.rerender();
  selection=rendered['master-rows'].children[0].children[5].children[1];assert.equal(selection.value,'model');assert.equal(rendered.board.scrollLeft,270);
  rendered.context.document.activeElement={matches:()=>true};rendered.rerender();
  assert.equal(rendered['master-rows'].children[0].children[5].children[1],selection);
});

test('Print Queue filters client and SE names and cancels only unclaimed jobs',()=>{
  const rendered=board({models:[],entries:[],printJobs:[
    {id:'one',kind:'se_code_slip',status:'pending',se_daily_checkins:{sales_executives:{name:'Ana'}}},
    {id:'two',kind:'se_code_slip',status:'claimed',se_daily_checkins:{sales_executives:{name:'Ben'}}}]});
  assert.deepEqual(rendered['print-rows'].children[0].children[4].children.map(button=>button.textContent),['Print','Cancel']);
  assert.equal(rendered['print-rows'].children[1].children[4].children.some(button=>button.textContent==='Cancel'),false);
  rendered['print-search'].value='aNa';rendered.renderPrints();assert.equal(rendered['print-rows'].children.length,1);
  assert.equal(rendered['print-rows'].children[0].children[1].textContent,'Ana');
});

test('Settings sample shows a compact configured ticket and speaks its configured pronunciation',()=>{
  const speech=fs.readFileSync(path.join(PUBLIC,'settings-speech.js'),'utf8');
  const sample=extractFunction(speech,'sampleTicket');
  const fields={'.model-prefix':{value:'CRY'},'.model-pronounce':{value:'Cool ray'},'.model-label':{value:'Geely Coolray'}};
  const block={classList:{contains:()=>false},querySelectorAll:()=>[{querySelector:selector=>fields[selector]}],querySelector:()=>({value:'GEELY'})};
  const ctx={document:{querySelectorAll:()=>[block]}};vm.createContext(ctx);vm.runInContext(sample,ctx);
  assert.equal(ctx.sampleTicket().ticket,'CRY01');assert.equal(ctx.sampleTicket(true).ticket,'Cool ray 0 1');
  assert.equal(ctx.sampleTicket().counter,'Geely Coolray');assert.equal(ctx.sampleTicket().service,'GEELY');
  fields['.model-shortname-pronounce']={value:'Cool ray'};
  assert.equal(ctx.sampleTicket(true).counter,'Cool ray');assert.equal(ctx.sampleTicket().counter,'Geely Coolray');
  assert.doesNotMatch(speech,/ticket:'A A 0 1'/);
});
test('dashboard Ongoing delegates to the persistent local action path without a cloud request',async()=>{
  const {call,context}=bridge('http://localhost:8081/dashboard.html',config,async()=>{throw Error('must not request cloud');});
  assert.equal((await call({action:'ongoing',entryId:'client'})).ok,true);
  assert.equal(context.localRequest.action,'ongoing');assert.equal(context.localRequest.entryId,'client');
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
  assert.equal(rendered['sales-rows'].children[0].children[6].children[0].textContent,'Reprint');
});

test('Master Table shows the linked agent name and its complete four-digit code',()=>{
  const rendered=board({models:[{id:'model',full_name:'RAV4'}],entries:[{id:'entry',vehicle_model_id:'model',queue_number:1,status:'waiting',agentName:'Test Agent',agentCode:'0042',registrations:{full_name:'Test Client'}}],printJobs:[]});
  assert.equal(rendered['master-rows'].children[0].children[2].textContent,'Test Agent / 0042');
});

test('client labels use complete prefixed numbers and the same large-code layout as SE slips',()=>{
  const context={};vm.createContext(context);vm.runInContext(extractFunction(main,'formatClientLabel')+'\n'+extractFunction(main,'buildPrintLabelHtml'),context);
  for(const number of [1,9,99,100]) {
    const label=context.formatClientLabel({kind:'client_ticket',header:'GX3 PRO',brandKey:'toyota',unit:1,queueNumber:number},config);
    assert.equal(label.value,'AA'+String(number).padStart(2,'0'));
    const html=context.buildPrintLabelHtml(label);assert.match(html,/client-ticket large-code/);assert.ok(html.includes(`<p>${label.value}</p>`));
  }
  assert.throws(()=>context.formatClientLabel({kind:'client_ticket',brandKey:'foreign',unit:1,queueNumber:1},config),/mapping changed/);
});

test('desktop queues ticket speech through its private local service instead of a renderer Audio element',async()=>{
  let sent;
  const context={TTS_PORT:9000,TTS_PLAYBACK_TOKEN:'private-test',AbortSignal,fetch:async(url,options)=>{sent={url,options};return Response.json({queued:true,cacheReady:true});}};
  vm.createContext(context);vm.runInContext(extractFunction(main,'queueTicketSpeech'),context);
  const result=await context.queueTicketSpeech('callback',{brand_key:'toyota',unit_index:1},7);
  assert.equal(result.speechQueued,true);assert.equal(sent.options.headers['X-TDQSYS-Playback'],'private-test');assert.equal(JSON.parse(sent.options.body).number,7);
  assert.doesNotMatch(source,/new Audio\(|result.audioUrl/);
});

test('SE label is 50 by 30mm with a 36pt code and auto-fits the name without shrinking the code',()=>{
  const context={};vm.createContext(context);vm.runInContext(extractFunction(main,'buildPrintLabelHtml'),context);
  const html=context.buildPrintLabelHtml({kind:'se_code_slip',header:'Long <Executive> Name',value:'0042'});
  assert.match(html,/size:50mm 30mm/);assert.match(html,/\.large-code p\{font-size:36pt/);assert.match(html,/Long &lt;Executive&gt; Name/);assert.match(html,/<p>0042<\/p>/);
  const header={style:{fontSize:'32px'},clientHeight:38,clientWidth:174};const number={style:{fontSize:'36pt'}};
  const name={getBoundingClientRect:()=>({height:parseFloat(header.style.fontSize)*4}),get scrollWidth(){return 174;}};
  header.querySelector=()=>name;context.document={querySelector:tag=>tag==='h1'?header:number,body:{classList:{contains:()=>true}}};
  vm.runInContext(extractFunction(main,'fitPrintLabel'),context);context.fitPrintLabel();
  assert.ok(name.getBoundingClientRect().height<=38);assert.equal(number.style.fontSize,'36pt');
});

test('each facilitator page can read the same location snapshot with configured ticket prefixes',async()=>{
  for(const page of ['dashboard.html','dashboard-brand2.html','master-table.html','print-queue.html','sales-executives.html','event-setup.html']) {
    const decoration=vm.runInNewContext('('+extractFunction(main,'decorateLocalSnapshot')+')',{registrationSyncStatus:{}});
    const {call}=bridge(`http://localhost:8081/${page}`,config,async()=>{throw Error('must not fetch');},{localQueueAction:async()=>({ok:true,...decoration({models:[{id:'model',brand_key:'toyota',unit_index:2}],entries:[]},config)})});
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
  savedConfig.testDrive={sheetsUrl:'https://docs.google.com/spreadsheets/d/location/edit',dealerships:['Toyota North']};
  await context.registrationSyncTick();assert.deepEqual(calls.map(c=>c.action),['configure','configure','sync-sheets']);
  assert.equal(calls[1].sheetsUrl,savedConfig.testDrive.sheetsUrl);
  assert.deepEqual(calls[1].dealerships,['Toyota North']);
  fail=false;await context.registrationSyncTick();assert.equal(calls.at(-1).action,'sync-sheets');assert.equal(context.registrationSyncBusy,false);
});
