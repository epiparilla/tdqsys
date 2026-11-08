'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readPublic,read}=require('./helpers');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function screen(storage={},failure){
 const elements=[];
 function element(tag){const node={tag,children:[],style:{},value:'',checked:false,disabled:false,appendChild(child){this.children.push(child);},setAttribute(){},showModal(){},focus(){},close(){},remove(){this.removed=true;},addEventListener(){}};elements.push(node);return node;}
 let writes=0,after=0,serial=0,request;const body=element('body');
 const options={kind:'claims',target:'client',name:'Test Client',expected:['Cap'],items:['Cap','Mug'],instanceId:'location',runId:'run',after:async()=>{after++;},request:async operation=>{
  if(operation.action.endsWith('history'))return {history:[]};writes++;request=operation;if(failure)throw failure;return {saved:true};
 }};
 const context={document:{getElementById:id=>elements.find(node=>!node.removed && node.id===id),body,createElement:element,createTextNode:text=>({textContent:text})},localStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>{storage[key]=value;},removeItem:key=>{delete storage[key];}},crypto:{randomUUID:()=>`request-${++serial}`},window:{confirm:()=>true,alert(){}}};
 vm.runInNewContext(readPublic('giveaway-corrections.js'),context);
 return {context,options,storage,elements,get writes(){return writes;},get after(){return after;},get request(){return request;},save:()=>elements.find(node=>node.tag==='button'),dialog:()=>elements.find(node=>node.tag==='dialog')};
}
test('correction confirmation blocks incomplete input and saves explicit reviewed before/after',async()=>{
 const ui=screen();await ui.context.window.TdqGiveawayCorrections.open(ui.options);
 const inputs=ui.elements.filter(node=>node.tag==='input'),reason=ui.elements.find(node=>node.tag==='textarea');
 await ui.save().onclick();assert.equal(ui.writes,0);
 inputs[0].checked=false;inputs[1].checked=true;inputs[2].value='Operator';reason.value='Wrong selection';inputs[3].checked=true;
 ui.context.window.confirm=()=>false;await ui.save().onclick();assert.equal(ui.writes,0);assert.equal(Object.keys(ui.storage).length,0);
 ui.context.window.confirm=()=>true;await ui.save().onclick();assert.equal(ui.writes,1);assert.equal(ui.after,1);assert.equal(ui.request.confirm,true);assert.deepEqual(Array.from(ui.request.expected),['Cap']);assert.deepEqual(Array.from(ui.request.value),['Mug']);assert.equal(ui.request.operator,'Operator');assert.equal(Object.keys(ui.storage).length,0);assert.equal(ui.dialog().removed,true);
});
test('uncertain correction survives reopening and retries the identical request without editable values',async()=>{
 const ui=screen({},Error('Offline'));await ui.context.window.TdqGiveawayCorrections.open(ui.options);
 const inputs=ui.elements.filter(node=>node.tag==='input');inputs[0].checked=false;inputs[2].value='Operator';inputs[3].checked=true;ui.elements.find(node=>node.tag==='textarea').value='Mistaken item';
 await ui.save().onclick();assert.equal(Object.keys(ui.storage).length,1);const first=JSON.stringify(ui.request);
 assert.equal(ui.elements.find(node=>node.tag==='fieldset').disabled,true);
 const retry=screen(ui.storage);await retry.context.window.TdqGiveawayCorrections.open(retry.options);assert.equal(retry.save().textContent,'Retry same correction');await retry.save().onclick();assert.equal(JSON.stringify(retry.request),first);assert.equal(Object.keys(retry.storage).length,0);
});
test('stale conflict blocks editing/retrying until refresh, and beginning-balance UI keeps normal fields locked',async()=>{
 const ui=screen({},Object.assign(Error('Values changed'),{status:409}));ui.options.kind='opening';ui.options.expected=10;
 await ui.context.window.TdqGiveawayCorrections.open(ui.options);const inputs=ui.elements.filter(node=>node.tag==='input');inputs[0].value='8';inputs[1].value='Operator';inputs[2].checked=true;ui.elements.find(node=>node.tag==='textarea').value='Original count incorrect';
 await ui.save().onclick();assert.equal(ui.request.value,8);assert.equal(ui.save().disabled,true);assert.equal(Object.keys(ui.storage).length,0);
 const stock=readPublic('giveaway-stock-settings.js');assert.match(stock,/row.quantity.readOnly=!!stock\?\.initialized/);assert.match(stock,/correct.textContent='Correct balance \/ history'/);
 const main=read('app/main.js');assert.match(main,/settingsActions = \[[^\n]*'giveaway-correct', 'giveaway-correction-history'/);
 for(const file of ['settings.html','giveaways.html'])assert.match(readPublic(file),/src="giveaway-corrections.js"/);
});
