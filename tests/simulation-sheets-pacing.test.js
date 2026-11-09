'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read,extractFunction}=require('./helpers');
test('Sheets catch-up is bounded and sequential only for an active simulation at this location',async()=>{
 for(const [active,identity,reply,expected] of [[true,'location',{delivered:true},5],[false,'location',{delivered:true},1],[true,'other',{delivered:true},1],[true,'location',{idle:true},1],[true,'location',{delivered:false},1]]){
  let calls=0,inFlight=0,peak=0;
  const cfg={instanceId:'location',cloudWriterToken:'writer',testDrive:{sheetsUrl:'saved'}};
  const ctx={registrationSyncBusy:false,registrationSyncStatus:{},registrationSettingsHash:null,registrationSimulator:{identity,state:{active}},engineDown:()=>false,app:{isQuitting:false},fs:{readFileSync:()=>JSON.stringify({config:cfg})},path:require('node:path'),crypto:require('node:crypto'),require:()=>({status:()=>({canWrite:true})}),BASE_DIR:'.',RES_SERVER:'.',SUPABASE_URL:'https://example.invalid',buildTestDriveSettings:()=>({action:'configure'}),AbortSignal,fetch:async(_url,options)=>{if(JSON.parse(options.body).action==='sync-sheets'){calls++;inFlight++;peak=Math.max(peak,inFlight);await Promise.resolve();inFlight--;return {ok:true,json:async()=>reply};}return {ok:true,json:async()=>({})};}};
  vm.createContext(ctx);vm.runInContext(extractFunction(read('app/main.js'),'registrationSyncTick'),ctx);await ctx.registrationSyncTick();
  assert.equal(calls,expected);assert.equal(peak,1);assert.equal(ctx.registrationSyncBusy,false);
 }
});
