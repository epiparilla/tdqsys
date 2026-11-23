'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const report=require('../public/ticket-report');
const {buildExport,csv}=require('../shared/ticket-export');
function fixture(){
 const ticket=(id,registrationId,model,status,runId='official')=>({id,registrationId,model,status,runId,day:'2026-11-12',runNumber:2,number:Number(id),brandKey:'brand1',unitIndex:1,submittedAt:'2026-11-12T01:02:03Z',issuedAt:'2026-11-12T03:00:00Z',name:'=HYPERLINK("bad")',email:'a@b.test',cityAddress:'City & Town',contactNumber:'09000000001',agent:'Agent',dealership:id==='2'?' dealer  one ':'Dealer One'});
 return {instanceId:'one',from:'2026-11-12',to:'2026-11-12',asOf:'2026-11-12T04:00:00Z',timezone:'Asia/Manila',token:'token',runs:[{id:'official',day:'2026-11-12',number:2,reason:'Testing'},{id:'test',day:'2026-11-12',number:1}],leads:[{id:'a',runId:'official'},{id:'b',runId:'official'},{id:'duplicate',runId:'official'},{id:'test',runId:'test'}],tickets:[ticket('1','a','Model White','cancelled'),ticket('2','a','Model Black','done'),ticket('3','a','Another','done'),ticket('4','b','Model White','no_show'),ticket('5','b','Model White','waiting'),ticket('6','test','Model White','ongoing','test')]};
}
test('report counts leads separately, retains reissues and changed models, groups colors without dropping tickets',()=>{
 const s=report.summarize(fixture(),['test']);assert.equal(s.totals.leads,3);assert.equal(s.totals.clients,2);assert.equal(s.totals.tickets,5);assert.equal(s.totals.done,2);assert.equal(s.dealers.length,1);assert.equal(s.models.length,2);assert.equal(s.models.find(m=>m.label==='Model').tickets,4);assert.equal(report.summarize(fixture(),['test'],false).models.length,3);
 assert.throws(()=>report.summarize(fixture(),['other-location']),/outside/);
 const bad=fixture();bad.tickets[0].status='unknown';assert.throws(()=>report.summarize(bad),/Unknown/);
 assert.equal(report.summarize(fixture(),['test','official']).totals.leads,0);
});
test('export has one row per ticket, literal contacts/formulas, correct time zone, no registration IDs',()=>{
 const s=fixture();const bytes=buildExport(s,['test'],'xlsx',[{key:'brand1',models:[{prefix:'AA'}]}]);
 assert.equal(bytes.readUInt32LE(0),0x04034b50);const text=bytes.toString();assert.match(text,/Issued tickets/);assert.match(text,/09000000001/);assert.match(text,/AA01/);assert.match(text,/<c r="A2" s="2"><v>46338\./);assert.match(text,/=HYPERLINK/);assert.doesNotMatch(text,/<f[ >]/);assert.doesNotMatch(text,/registrationId|Registration ID/);assert.match(text,/City &amp; Town/);assert.match(text,/<autoFilter ref="A1:P6"/);assert.match(text,/Report scope/);
 const output=buildExport(s,['test'],'csv').toString();assert.equal(output.split('\r\n').filter(Boolean).length,6);assert.match(output,/'=HYPERLINK/);assert.match(csv([['+evil','@evil','-evil','\tevil']]),/"'\+evil"/);assert.throws(()=>buildExport(s,[],'exe'),/Excel or CSV/);
});
function element(){return {children:[],value:'',checked:true,disabled:false,style:{},appendChild(x){this.children.push(x);},replaceChildren(...x){this.children=x;}};}
test('report UI keeps exclusions, blocks stale filters and pending sync, export sends the displayed snapshot token',async()=>{
 const ids=['report-from','report-to','report-apply','report-format','report-export','report-combine','report-runs','report-cards','report-dealers','report-models','report-days','report-run-count','report-status'];
 const nodes=Object.fromEntries(ids.map(id=>[id,element()])),calls=[];nodes['report-format'].value='xlsx';let pending=0,fail=false;
 const ctx={document:{getElementById:id=>nodes[id],createElement:element,hidden:false},setInterval(){},clearInterval(){},window:{TdqTicketReport:report,addEventListener(){},afDesktop:{testDrive:async body=>{calls.push(body);if(body.action==='export-ticket-report')return {ok:true,canceled:true};return fail?{ok:false,error:'Offline'}:{ok:true,...fixture(),pending};}}}};
 vm.runInNewContext(fs.readFileSync('public/ticket-report-ui.js','utf8'),ctx);await new Promise(r=>setImmediate(r));
 assert.equal(nodes['report-cards'].children[0].children[1].textContent,'4');
 const check=nodes['report-runs'].children[1].children[0];check.checked=false;check.onchange();assert.equal(nodes['report-cards'].children[0].children[1].textContent,'3');
 await nodes['report-export'].onclick();assert.equal(calls.at(-1).token,'token');assert.deepEqual([...calls.at(-1).excludedRunIds],['test']);
 nodes['report-from'].value='2026-11-11';nodes['report-from'].onchange();assert.equal(nodes['report-export'].disabled,true);
 pending=1;await nodes['report-apply'].onclick();assert.equal(nodes['report-export'].disabled,true);assert.match(nodes['report-status'].textContent,/await sync/);
 pending=0;await nodes['report-apply'].onclick();assert.equal(nodes['report-export'].disabled,false);assert.equal(nodes['report-runs'].children[1].children[0].checked,false);
 fail=true;await nodes['report-apply'].onclick();assert.equal(nodes['report-export'].disabled,true);assert.match(nodes['report-status'].textContent,/Offline/);
});
test('report RPC/bridge remain private, read-only and do not silently classify Testing runs',()=>{
 const sql=fs.readFileSync('supabase/migrations/202611230001_ticket_reporting.sql','utf8');assert.match(sql,/stable security definer/);assert.match(sql,/from public,anon,authenticated/);assert.doesNotMatch(sql,/\b(insert into|update |delete from|tdqsys_ensure_daily_run)\b/i);
 const main=fs.readFileSync('app/main.js','utf8');assert.match(main,/sender.pathname==='\/live-dashboard.html'.*actions.push\('ticket-report'/);assert.match(main,/saved.token!==request.token/);assert.match(main,/if\(pending\(\)\)throw Error/);
 const ui=fs.readFileSync('public/ticket-report-ui.js','utf8');assert.doesNotMatch(ui,/reason.*===.*Testing/);
});
test('native report export binds frame/location/token, refuses pending sync and handles Save cancellation',async()=>{
 const source=fs.readFileSync('app/main.js','utf8');const start=source.indexOf("if(['ticket-report','export-ticket-report'].includes(request.action)) {");
 const block=source.slice(start,source.indexOf("if (request.action === 'printers')",start));
 let pending=0,canceled=true,writes=0;
 const context={request:null,cfg:{instanceId:'one',brands:[]},event:{sender:{id:1},senderFrame:{routingId:2}},ticketReportSnapshots:new Map(),
  getLocalQueue:()=>({state:{outbox:Array(pending).fill({})}}),remoteQueueOperation:async()=>fixture(),localConfig:()=>({instanceId:'one'}),
  crypto:{randomUUID:()=> 'fresh-token'},RES_SERVER:require('node:path').resolve(__dirname,'..'),require,
  BrowserWindow:{fromWebContents:()=>null},dialog:{showSaveDialog:async()=>({canceled,filePath:'private.xlsx'})},app:{getPath:()=>'.'},path:require('node:path'),fs:{promises:{writeFile:async()=>{writes++;}}}};
 vm.createContext(context);const execute=async request=>{context.request=request;return vm.runInContext(`(async()=>{${block}})()`,context);};
 const snapshot=await execute({action:'ticket-report'});assert.equal(snapshot.token,'fresh-token');
 await assert.rejects(()=>execute({action:'export-ticket-report',token:'other',format:'xlsx'}),/expired/);
 pending=1;await assert.rejects(()=>execute({action:'export-ticket-report',token:snapshot.token,format:'xlsx'}),/synchronization/);pending=0;
 assert.equal((await execute({action:'export-ticket-report',token:snapshot.token,format:'xlsx'})).canceled,true);assert.equal(writes,0);
 canceled=false;await execute({action:'export-ticket-report',token:snapshot.token,format:'xlsx'});assert.equal(writes,1);
 context.event.senderFrame.routingId=3;await assert.rejects(()=>execute({action:'export-ticket-report',token:snapshot.token,format:'xlsx'}),/expired/);
});
