'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../public/print-label'),{loadAfJs}=require('./helpers');
test('ticket formats default independently to existing header/code sizes and cannot change fixed paper size',()=>{
 const formats=api.normalize();assert.equal(formats.client.header.fontSize,24);assert.equal(formats.agent.number.fontSize,36);
 formats.client.header.fontSize=15;assert.equal(formats.agent.header.fontSize,24);
 const html=api.buildHtml({kind:'client_ticket',header:'COOLRAY',value:'CRY01'},{...formats,width:100,height:200});
 assert.match(html,/@page\{size:50mm 30mm;margin:0\}/);assert.match(html,/<p>CRY01<\/p>/);assert.match(html,/font-size:15pt/);
});
test('both label types support safe font, size, bold, italic and alignment formatting',()=>{
 const formats=api.normalize();formats.agent.header={fontFamily:'Georgia',fontSize:18,bold:false,italic:true};formats.agent.align='right';
 const html=api.buildHtml({kind:'se_code_slip',header:'Ana & <Reyes>',value:'0042'},api.validate(formats));
 assert.match(html,/font-family:'Georgia';font-size:18pt;font-weight:400;font-style:italic/);assert.match(html,/text-align:right/);
 assert.match(html,/Ana &amp; &lt;Reyes&gt;/);assert.match(html,/<p>0042<\/p>/);
 assert.doesNotMatch(api.buildHtml({header:'</script><script>evil()</script>',value:'<img src=x>'}),/<script>evil|<img src=x>/);
});
test('font validation refuses invalid settings and renderer normalizes corrupt or injected CSS safely',()=>{
 for(const value of [0,100,Infinity,NaN]){const formats=api.normalize();formats.client.header.fontSize=value;assert.throws(()=>api.validate(formats),/font/);}
 const raw={client:{align:'left;position:fixed',header:{fontFamily:"Arial';}body{display:none",fontSize:999}}};
 assert.equal(api.normalize(raw).client.header.fontSize,24);assert.equal(api.normalize(raw).client.align,'center');
 assert.doesNotMatch(api.buildHtml({header:'CAR',value:'AA01'},raw),/display:none/);
});
test('Settings detects formatting-only edits without changing brand or queue configuration',()=>{
 const af=loadAfJs(),base={brands:[],ticketPrinting:api.normalize()},next=structuredClone(base);next.ticketPrinting.agent.number.fontSize=30;
 assert.equal(af.afConfigEqual(base,next),false);assert.equal(af.afConfigEqual(base,structuredClone(base)),true);
 const settings=fs.readFileSync(require('node:path').join(__dirname,'../public/settings.html'),'utf8');
 assert.match(settings,/TdqTicketPrint.hydrate\(c.ticketPrinting\)/);assert.match(settings,/config.ticketPrinting = window.TdqTicketPrint.collect\(\)/);
 assert.match(settings,/sandbox="allow-scripts"/);assert.doesNotMatch(settings,/ticket-width|ticket-height/);
});
test('live preview uses the same renderer as printing and never submits a printer job',()=>{
 const read=file=>fs.readFileSync(require('node:path').join(__dirname,'../',file),'utf8');
 const ui=read('public/settings-ticket-print.js'),main=read('app/main.js');
 assert.match(ui,/srcdoc=api.buildHtml/);assert.doesNotMatch(ui,/afDesktop|fetch\(|\.print\(/);
 assert.match(main,/buildPrintLabelHtml\(formatClientLabel\(label,cfg\),cfg.ticketPrinting\)/);
 assert.match(main,/pageSize: \{ width: 50000, height: 30000 \}/);
 assert.match(main,/require\(path.join\(RES_SERVER,'public','print-label.js'\)\).fit/);
});
test('text auto-fit only shrinks oversized lines, keeping complete values',()=>{
 const header={style:{fontSize:'32px'},clientHeight:38,clientWidth:174},number={style:{fontSize:'64px'},clientWidth:174};
 const name={getBoundingClientRect:()=>({height:parseFloat(header.style.fontSize)*3}),scrollWidth:174};
 Object.defineProperty(number,'scrollWidth',{get:()=>parseFloat(number.style.fontSize)*4});header.querySelector=()=>name;
 const body={clientHeight:113,get scrollHeight(){return 60+parseFloat(number.style.fontSize);}};
 const context={document:{querySelector:tag=>tag==='h1'?header:number,body},getComputedStyle:element=>({fontSize:element.style.fontSize})};
 vm.runInNewContext('('+api.fit.toString()+')()',context);
 assert.ok(parseFloat(header.style.fontSize)<=12.5);assert.ok(number.scrollWidth<=174);assert.ok(body.scrollHeight<=113);
});
test('isolated engine persists valid font settings without changing queues and rejects invalid saves atomically',async()=>{
 const engine=await require('./helpers').startEngine();
 try{
  const before=await (await fetch(engine.base+'/api/data')).json(),next=structuredClone(before);
  next.config.ticketPrinting=api.normalize();next.config.ticketPrinting.client.number.fontSize=32;
  const post=doc=>fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
  assert.equal((await post(next)).status,200);
  const saved=await (await fetch(engine.base+'/api/data')).json();
  assert.deepEqual(saved.config.ticketPrinting,next.config.ticketPrinting);assert.deepEqual(saved.queues,before.queues);
  const invalid=structuredClone(saved);invalid.config.ticketPrinting.client.number.fontSize=400;
  assert.equal((await post(invalid)).status,400);
  assert.deepEqual((await (await fetch(engine.base+'/api/data')).json()).config.ticketPrinting,saved.config.ticketPrinting);
 }finally{await engine.stop();}
});
