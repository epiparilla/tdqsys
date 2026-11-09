'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readPublic,read}=require('./helpers'),api=require('../public/vehicle-import');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function screen(){
 const nodes=new Map(),calls=[],drafts=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{children:[],value:'1',checked:false,appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},click(){}});return nodes.get(id);};
 const brands=[{key:'brand1',name:'Brand',color:'#123456',models:[{label:'Car',shortname:'CAR',shortnamePronounce:'Car',prefix:'AA',pronounce:'A A'}]}];
 const context={stateDoc:{config:{brands}},unlocked:true,buildBrandEditors:config=>drafts.push(config),document:{getElementById:node,createElement:()=>node('node'+nodes.size)},window:{TdqVehicleImport:api,confirm:()=>true,addEventListener(){},afDesktop:{testDrive:async body=>{calls.push(body);return {ok:true,simulation:{active:body.action==='simulation-start',phase:'Ready',logs:[]}};}}},setInterval(){},clearInterval(){},setTimeout(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob};
 vm.runInNewContext(readPublic('settings-testing-tools.js'),context);return {node,context,calls,drafts,brands};
}
test('vehicle file preview never saves or changes live configuration; apply requires unlocked mode and confirmation',async()=>{
 const ui=screen();await tick();const before=JSON.stringify(ui.brands),text=api.stringify(ui.brands);
 await ui.node('vehicle-import-file').onchange({target:{files:[{size:text.length,text:async()=>text}]}});
 assert.equal(ui.drafts.length,0);assert.equal(JSON.stringify(ui.brands),before);assert.equal(ui.node('vehicle-import-apply').disabled,false);
 ui.context.unlocked=false;ui.node('vehicle-import-apply').onclick();assert.equal(ui.drafts.length,0);
 ui.context.unlocked=true;ui.context.window.confirm=()=>false;ui.node('vehicle-import-apply').onclick();assert.equal(ui.drafts.length,0);
 ui.context.window.confirm=()=>true;ui.node('vehicle-import-apply').onclick();assert.equal(ui.drafts.length,1);assert.equal(JSON.stringify(ui.brands),before);assert.ok(ui.calls.every(call=>call.action==='simulation-status'));
});
test('stale file reads cannot replace a newer preview; invalid files cannot be applied',async()=>{
 const ui=screen();let resolve;const slow=ui.node('vehicle-import-file').onchange({target:{files:[{size:10,text:()=>new Promise(done=>{resolve=done;})}]}});
 const newer=[{...ui.brands[0],name:'Newest'}];const text=api.stringify(newer);await ui.node('vehicle-import-file').onchange({target:{files:[{size:text.length,text:async()=>text}]}});resolve(api.stringify(ui.brands));await slow;
 ui.node('vehicle-import-apply').onclick();assert.equal(ui.drafts[0].brands[0].name,'Newest');
 await ui.node('vehicle-import-file').onchange({target:{files:[{size:2,text:async()=> '{}'}]}});assert.equal(ui.node('vehicle-import-apply').disabled,true);
});
test('simulation UI requires explicit acknowledgement and confirmation and offers stop without altering Settings',async()=>{
 const ui=screen();await tick();await ui.node('simulation-start').onclick();assert.equal(ui.calls.some(call=>call.action==='simulation-start'),false);
 ui.node('simulation-confirm').checked=true;ui.context.window.confirm=()=>false;await ui.node('simulation-start').onclick();assert.equal(ui.calls.some(call=>call.action==='simulation-start'),false);
 ui.context.window.confirm=()=>true;await ui.node('simulation-start').onclick();assert.equal(ui.calls.at(-1).action,'simulation-start');assert.equal(ui.node('simulation-stop').disabled,false);
 await ui.node('simulation-stop').onclick();assert.equal(ui.calls.at(-1).action,'simulation-stop');assert.equal(ui.drafts.length,0);
 const main=read('app/main.js');assert.match(main,/sender.pathname!=='\/settings.html'/);assert.match(main,/registrationSimulator\?\.stop\(\)/);assert.match(read('app/assemble-server.ps1'),/registration-simulator.js/);
});
