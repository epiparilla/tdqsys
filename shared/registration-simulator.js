'use strict';
const {randomUUID}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
class RegistrationSimulator {
 constructor({getConfig,remote,request,allowed=()=>{},persist=()=>{},onRegistration=()=>{},restored=null,sleep=delay,id=randomUUID,now=Date.now}){
  Object.assign(this,{getConfig,remote,request,allowed,persist,onRegistration,sleep,id,now});
  this.state=restored?{...restored,active:false,phase:restored.active?'Interrupted — verify tables before another test':restored.phase}:{active:false,phase:'Ready',agents:0,clients:0,tickets:0,logs:[]};
 }
 status(){return structuredClone(this.state);}
 update(values={},message){Object.assign(this.state,values);if(message)this.state.logs=[...(this.state.logs||[]),message].slice(-100);this.persist(this.status());}
 start(options){
  if(this.state.active)throw Error('A simulation is already running.');
  if(options.confirm!==true || !Number.isInteger(options.agents)||options.agents<1||options.agents>10||!Number.isInteger(options.clients)||options.clients<1||options.clients>20)throw Error('Confirm testing and select 1–10 Agents and 1–20 clients.');
  const config=this.getConfig();this.allowed(config);
  const base=new URL(config.cloudBase);if(base.protocol!=='https:'||base.username||base.password)throw Error('Save a valid HTTPS Cloud Base URL first.');
  if(!config.testDrive?.dealerships?.length)throw Error('Save at least one dealership before testing.');
  this.controller=new AbortController();this.stopping=false;this.identity=config.instanceId;this.settings=JSON.stringify([config.brands,config.testDrive]);this.started=this.now();this.lastClientAt=null;
  this.state={active:true,phase:'Preparing empty test run',agents:0,clients:0,tickets:0,totalAgents:options.agents,totalClients:options.clients,logs:[],startedAt:new Date(this.started).toISOString()};this.update();
  this.task=this.run(config,options).catch(error=>{this.update({phase:this.stopping?'Stopped — verify any last in-flight registration':'Stopped on error',error:error.message});}).finally(()=>{this.update({active:false,nextSubmissionAt:null});});
  return this.status();
 }
 stop(){if(this.state.active){this.stopping=true;this.controller.abort();this.update({phase:'Stopping after the current request'});}return this.status();}
 check(){if(this.stopping)throw Error('Stopped by the operator.');const config=this.getConfig();this.allowed(config);if(config.instanceId!==this.identity || JSON.stringify([config.brands,config.testDrive])!==this.settings)throw Error('Saved registration settings changed. Verify records before restarting.');}
 async waitUntil(due){this.check();const ms=Math.max(0,due-this.now());if(ms){this.update({nextSubmissionAt:new Date(due).toISOString()},`Next registration in ${(ms/1000).toFixed(1)} seconds.`);await this.sleep(ms,undefined,{signal:this.controller.signal});}this.check();}
 async pause(){await this.waitUntil(this.started+(this.state.agents+this.state.clients)*5000);}
 async run(config,options){
  this.check();await this.remote({action:'configure'},this.identity);this.check();
  const run=await this.remote({action:'simulation-open',confirm:true},this.identity);this.check();this.update({runId:run.runId});
  const initial=await this.request(config,'config',null);if(!initial.models?.length||!initial.dealerships?.length)throw Error('Registration models/dealerships are not ready.');
  const letters=this.id().replace(/-/g,'').slice(0,10).replace(/[0-9]/g,char=>String.fromCharCode(107+Number(char)));
  const agents=[];
  for(let index=0;index<options.agents;index++){
   this.check();const name=`TEST Agent ${letters} ${String.fromCharCode(65+index)}`;
   const result=await this.request(config,'se-checkins',{instanceId:this.identity,simulationRunId:run.runId,name,dealership:initial.dealerships[index%initial.dealerships.length],contactNumber:String(index+1).padStart(11,'0')});
   if(!/^\d{4}$/.test(result.code))throw Error('Agent registration did not return a valid code.');agents.push({name,code:result.code});
   this.update({agents:agents.length,phase:'Registering TEST Agents'},`${name} registered.`);await this.pause();
  }
  for(let index=0;index<options.clients;index++){
   this.check();const current=await this.request(config,'config',null);
   if(JSON.stringify(current)!==JSON.stringify(initial))throw Error('Online registration configuration changed. Test stopped.');
   const agent=agents[index%agents.length],selected=[initial.models[index%initial.models.length]];
   if(index%3===0&&initial.models.length>1)selected.push(initial.models[(index+1)%initial.models.length]);
   // Submission itself validates the code. Avoid a redundant prefill lookup.
   if(this.lastClientAt!==null)await this.waitUntil(this.lastClientAt+4200);
   this.check();const name=`TEST Client ${letters} ${String.fromCharCode(65+index)}`,body={instanceId:this.identity,simulationRunId:run.runId,fullName:name,email:`test.${letters}.${index+1}@example.invalid`,cityAddress:'TEST City',contactNumber:String(index+1).padStart(11,'0'),modelIds:selected.map(model=>model.id),seCode:agent.code,privacyAccepted:true,waiverAccepted:true,termsAccepted:true,waiverVersion:current.waiverVersion,termsVersion:current.termsVersion,forApplication:'',forReservation:''};
   this.lastClientAt=this.now();const result=await this.request(config,'registrations',body,this.id());
   this.update({clients:index+1,tickets:this.state.tickets+(result.entries?.length||0),phase:'Registering TEST clients'},`${name} registered for ${selected.map(model=>model.name).join(', ')}.`);
   this.onRegistration();
   if(index<options.clients-1)await this.pause();
  }
  this.update({phase:'Complete — reset/open a new official run before real registrations'},'Test records retained. Printing is manual. Google Sheets rows are not deleted by TDQSYS cleanup.');
 }
}
module.exports={RegistrationSimulator};
