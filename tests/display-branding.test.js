'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const api=require('../public/display-branding'),{extractFunction,loadAfJs,startEngine}=require('./helpers');
const read=file=>fs.readFileSync(path.join(__dirname,'../',file),'utf8');
const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZYAAAAAASUVORK5CYII=';
test('supplied fonts are bundled byte-identically and selectable without editable display sizes',()=>{
 const css=read('public/display-branding.css');
 assert.match(css,/\.logo-preview\[hidden\]\{display:none\}/);
 const hashes={'GEELY-Bold.ttf':'b78d7631707640868e4b49a24c0041a2b7b2731cd322eae35786f5ceef739a8e','Inter-Variable.ttf':'be9d264ecc9f0d93bb37384a528408fcc3bded7ce4c6c3630d4b85438ca73376','LynkcoType-Medium.ttf':'ed0a8594b095d373af6796dff90a1ec658c8e4049e6b38e74a13f51a485b9b7b'};
 for(const [file,hash] of Object.entries(hashes)){
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../public/fonts',file))).digest('hex'),hash);assert.ok(css.includes(file));
 }
 const ui=read('public/settings-display-branding.js');for(const key of ['brandFont','labelFont','queueFont'])assert.ok(ui.includes(key));
 assert.doesNotMatch(ui,/fontSize|type="number"/);
});
test('display defaults preserve text and safe font choices reject external paths or CSS injection',()=>{
 assert.deepEqual(api.normalize(),{brandFont:'auto',labelFont:'auto',queueFont:'auto',headerMode:'text',logo:''});
 assert.equal(api.normalize({brandFont:'geely'}).brandFont,'geely');
 assert.equal(api.normalize({queueFont:'x;display:none',logo:'file:///secret',headerMode:'logo'}).headerMode,'text');
 assert.throws(()=>api.validate({brandFont:'url(https://example.test)'}),/listed display font/);
 for(const bad of ['https://example.test/logo.png','data:image/svg+xml;base64,PHN2Zz4=',logo+'x'.repeat(45000)])assert.throws(()=>api.validate({headerMode:'logo',logo:bad}),/PNG logo|brand logo/);
 assert.equal(api.validate({headerMode:'logo',logo}).logo,logo);
});
test('TV and remote viewer share fonts, logo rendering and appearance-triggered rebuilds',()=>{
 for(const file of ['public/display_with_ads.html','public/client.html']){
  const html=read(file);assert.match(html,/href="display-branding.css"/);assert.match(html,/src="display-branding.js"/);
  assert.match(html,/TdqDisplayBranding.apply\(section,h1,brand\)/);assert.match(html,/JSON.stringify\(b.display \|\| null\)/);
 }
});
test('supplied fonts can also be selected and embedded in a self-contained ticket label',()=>{
 const print=require('../public/print-label');
 const main=read('app/main.js'),context={require,path,fs,RES_SERVER:path.join(__dirname,'..')};
 vm.createContext(context);vm.runInContext(extractFunction(main,'buildPrintLabelHtml'),context);
 for(const name of ['GEELY Bold','Inter Variable','Lynkco Type Medium']){
  assert.ok(print.FONTS.includes(name));const format=print.normalize();format.client.header.fontFamily=name;format.client.number.fontFamily=name;
  const html=context.buildPrintLabelHtml({kind:'client_ticket',header:'CAR',value:'AA01'},format);assert.match(html,/@font-face/);assert.match(html,/data:font\/ttf;base64/);assert.match(html,/document.fonts.ready/);
 }
});
test('logo uses safe DOM attributes with brand-name fallback on load error',()=>{
 const properties={},heading={replaceChildren(image){this.image=image;}},section={style:{setProperty:(key,value)=>{properties[key]=value;}},dataset:{}};
 const context={document:{createElement:()=>({})}};vm.createContext(context);vm.runInContext(read('public/display-branding.js'),context);
 context.TdqDisplayBranding.apply(section,heading,{name:'Brand <name>',display:{brandFont:'geely',labelFont:'inter',queueFont:'lynkco',headerMode:'logo',logo}});
 assert.equal(heading.image.src,logo);assert.equal(heading.image.alt,'Brand <name>');assert.match(properties['--display-queue-font'],/Lynkco Type Medium/);
 heading.image.onerror();assert.equal(heading.textContent,'Brand <name>');
});
test('client-supplied logo padding is preserved while display scale changes',()=>{
 const renderer=read('public/display-branding.js'),upload=read('public/settings-display-branding.js'),css=read('public/display-branding.css');
 assert.doesNotMatch(renderer,/cropLogo|alphaBounds|getImageData|toDataURL|image.onload/);
 assert.doesNotMatch(upload,/cropLogo|alphaBounds|getImageData/);
 assert.match(upload,/width\/image.naturalWidth,128\/image.naturalHeight/);
 assert.match(upload,/drawImage\(image,0,0,canvas.width,canvas.height\)/);
 assert.match(css,/\.brand-logo\{[^}]*height:4em;max-height:4em/);
 assert.match(css,/max-width:min\(80vw,1920px\)/);
});

test('TV and remote display use the fine-tuned label and whole-number scales at every breakpoint',()=>{
 const css=read('public/display-branding.css'),layout=read('public/style.css');
 assert.match(css,/\.brand-section\{--display-label-scale:1\.5;--display-queue-scale:0\.625\}/);
 for(const [selector,variable] of [['unit-label','label'],['unit-number','queue']]){
  const rules=[...layout.matchAll(new RegExp('\\.'+selector+'\\s*\\{([^}]+)\\}','g'))];
  assert.equal(rules.length,3);
  for(const rule of rules)assert.ok(rule[1].includes('var(--display-'+variable+'-scale, 1)'));
 }
 assert.match(layout,/\.prefix\s*\{\s*font-size: 0\.75em/);
 assert.match(layout,/\.prefix\s*\{\s*font-size: 0\.62em/);
});
test('appearance changes are detected but do not trigger a vehicle queue reset prompt',()=>{
 const af=loadAfJs(),base={brands:[{key:'brand1',name:'Brand',models:[{label:'Car',prefix:'AA'}]}]},changed=structuredClone(base);
 changed.brands[0].display=api.normalize({brandFont:'geely'});assert.equal(af.afConfigEqual(base,changed),false);
 const html=read('public/settings.html');assert.match(html,/TdqDisplaySettings.collect\(block\)/);assert.match(html,/TdqDisplaySettings.mount\(section/);
 assert.match(html,/map\(\(\{display,\.\.\.brand\}\)=>brand\)/);
});
test('isolated engine persists portable logo/font settings, preserves queues and rejects unsafe assets',async()=>{
 const engine=await startEngine();try{
  const before=await(await fetch(engine.base+'/api/data')).json(),next=structuredClone(before);
  next.config.brands[0].display=api.normalize({brandFont:'geely',labelFont:'inter',queueFont:'lynkco',headerMode:'logo',logo});
  const save=doc=>fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
  assert.equal((await save(next)).status,200);const after=await(await fetch(engine.base+'/api/data')).json();
  assert.deepEqual(after.config.brands[0].display,next.config.brands[0].display);assert.deepEqual(after.queues,before.queues);
  next.config.brands[0].display.logo='file:///local-only-logo.png';assert.equal((await save(next)).status,400);
  for(const file of ['GEELY-Bold.ttf','Inter-Variable.ttf','LynkcoType-Medium.ttf'])assert.match((await fetch(engine.base+'/fonts/'+file)).headers.get('Content-Type'),/font\/ttf/);
 }finally{await engine.stop();}
});
