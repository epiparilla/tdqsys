'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RegistrationSimulator}=require('../shared/registration-simulator');
function setup(extra={}){
 const {latency=0,setupLatency=0,...overrides}=extra;
 const config={instanceId:'location',cloudBase:'https://tdqsys-v2.pages.dev',brands:[],testDrive:{dealerships:['Dealer']}},calls=[],pauses=[],states=[];
 const publicConfig={models:[{id:'one',name:'One'},{id:'two',name:'Two'}],dealerships:['Dealer'],waiverVersion:'a'.repeat(64),termsVersion:'b'.repeat(64)};
 let serial=0,clock=0;const names=new Map();
 const simulator=new RegistrationSimulator({getConfig:()=>config,remote:async body=>{clock+=latency+setupLatency;calls.push(body);return {runId:'test-run'};},request:async(_config,route,body,key)=>{
  calls.push({route,body,key,at:clock});clock+=latency;if(route==='config')return structuredClone(publicConfig);if(route==='se-checkins'){const code=String(names.size+1).padStart(4,'0');names.set(code,body.name);return {code};}if(route==='se-code')return {name:names.get(body.code)};return {entries:body.modelIds.map(modelId=>({modelId}))};
 },sleep:async ms=>{pauses.push(ms);clock+=ms;},now:()=>clock,persist:state=>states.push(state),id:()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++serial).padStart(12,'0')}`,...overrides});
 return {simulator,config,calls,pauses,states,get elapsed(){return clock;}};
}
test('simulation uses real endpoints, normal consent/code checks and scoped TEST records at paced intervals',async()=>{
 const {simulator,calls,pauses,states}=setup();simulator.start({agents:1,clients:3,confirm:true});await simulator.task;
 assert.equal(simulator.status().clients,3);assert.equal(simulator.status().tickets,4);assert.equal(simulator.status().active,false);assert.match(simulator.status().phase,/Complete/);assert.deepEqual(pauses,[5000,5000,5000]);
 const submitted=calls.filter(call=>call.route==='registrations');assert.equal(submitted.length,3);assert.equal(submitted[0].body.modelIds.length,2);
 for(const call of submitted){assert.match(call.body.fullName,/^TEST Client [a-z]+ [A-Z]$/);assert.equal(call.body.simulationRunId,'test-run');assert.equal(call.body.printedWaiverAccepted,undefined);assert.equal(call.body.privacyAccepted,true);assert.match(call.body.contactNumber,/^0{10}[1-3]$/);assert.ok(call.key);assert.match(call.body.email,/@example\.invalid$/);}
 assert.equal(calls.some(call=>call.action==='print'),false);assert.equal(JSON.stringify(states).includes('0123'),false);
});

test('default batch includes normal network latency within its two-to-three-minute target and nudges Sheets for every client',async()=>{
 let nudges=0;const fixture=setup({latency:1000,onRegistration:()=>{nudges++;}});
 fixture.simulator.start({agents:10,clients:20,confirm:true});await fixture.simulator.task;
 assert.ok(fixture.elapsed>=120000&&fixture.elapsed<=180000,fixture.elapsed);assert.equal(nudges,20);assert.match(fixture.simulator.status().phase,/Complete/);
 assert.ok(fixture.pauses.every(ms=>ms<=5000));
});

test('catch-up after a slow setup never bursts client validation faster than its safe interval',async()=>{
 const fixture=setup({setupLatency:200000});fixture.simulator.start({agents:10,clients:20,confirm:true});await fixture.simulator.task;
 const posts=fixture.calls.filter(call=>call.route==='registrations');assert.equal(posts.length,20);
 for(let index=1;index<posts.length;index++)assert.ok(posts[index].at-posts[index-1].at>=4200);
});
test('simulation rejects missing confirmation/counts/licence/dealerships and duplicate starts',async()=>{
 const {simulator,config}=setup();for(const bad of [{agents:0,clients:2,confirm:true},{agents:11,clients:2,confirm:true},{agents:1,clients:21,confirm:true},{agents:1,clients:1,confirm:false}])assert.throws(()=>simulator.start(bad));
 const denied=setup({allowed:()=>{throw Error('Not licensed');}});assert.throws(()=>denied.simulator.start({agents:1,clients:1,confirm:true}),/licensed/);
 config.testDrive.dealerships=[];assert.throws(()=>simulator.start({agents:1,clients:1,confirm:true}),/dealership/);
 const active=setup();active.simulator.start({agents:1,clients:1,confirm:true});assert.throws(()=>active.simulator.start({agents:1,clients:1,confirm:true}),/already/);await active.simulator.task;
});
test('stop interrupts pacing, failed run guard prevents registrations, and interrupted jobs do not resume',async()=>{
 let sleeping;const stopped=setup({sleep:async(_ms,_value,{signal})=>new Promise((resolve,reject)=>{sleeping=resolve;signal.addEventListener('abort',()=>reject(Error('Stopped')),{once:true});})});
 stopped.simulator.start({agents:1,clients:3,confirm:true});await new Promise(resolve=>setImmediate(resolve));assert.ok(sleeping);stopped.simulator.stop();await stopped.simulator.task;assert.equal(stopped.simulator.status().clients,0);assert.equal(stopped.simulator.status().active,false);
 const failed=setup({remote:async body=>{if(body.action==='simulation-open')throw Error('Current run is not empty');return {};}});failed.simulator.start({agents:1,clients:1,confirm:true});await failed.simulator.task;assert.equal(failed.calls.some(call=>call.route==='se-checkins'),false);assert.match(failed.simulator.status().error,/not empty/);
 const restored=setup({restored:{active:true,clients:2,logs:[]}});assert.equal(restored.simulator.status().active,false);assert.match(restored.simulator.status().phase,/Interrupted/);assert.equal(restored.calls.length,0);
});
test('saved-settings changes stop a simulation before its next registration',async()=>{
 let config;const fixture=setup({sleep:async()=>{config.testDrive.dealerships.push('Changed');}});config=fixture.config;
 fixture.simulator.start({agents:1,clients:3,confirm:true});await fixture.simulator.task;assert.equal(fixture.simulator.status().clients,0);assert.match(fixture.simulator.status().error,/settings changed/);
});

test('default simulation completes ten Agents and twenty clients with twenty-seven tickets and no automatic printing',async()=>{
 const fixture=setup(),{simulator,calls,pauses}=fixture;simulator.start({agents:10,clients:20,confirm:true});await simulator.task;
 assert.equal(simulator.status().agents,10);assert.equal(simulator.status().clients,20);assert.equal(simulator.status().tickets,27);assert.equal(pauses.length,29);assert.equal(calls.filter(call=>call.route==='se-checkins').length,10);assert.equal(calls.filter(call=>call.route==='registrations').length,20);
 assert.match(simulator.status().phase,/Complete/);assert.equal(calls.some(call=>call.action==='print'),false);
 assert.equal(fixture.elapsed,145000);assert.equal(calls.some(call=>call.route==='se-code'),false);
});
