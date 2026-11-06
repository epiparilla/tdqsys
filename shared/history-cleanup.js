'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

class HistoryCleanup {
  constructor({queue,remote,chooseFile,readLocal,reconcile,files=fs,now=()=>Date.now(),uuid=()=>crypto.randomUUID()}) {
    Object.assign(this,{queue,remote,chooseFile,readLocal,reconcile,files,now,uuid});this.tickets=new Map();this.locked=null;
  }
  scope(request) {
    if(!['selected','clean'].includes(request.mode))throw Error('Choose a cleanup mode.');
    const runIds=request.mode==='clean'?[]:[...new Set(request.runIds || [])].sort();
    if(request.mode==='selected' && (!runIds.length || runIds.length>100))throw Error('Select closed test runs first.');
    return {mode:request.mode,runIds};
  }
  metadata(result) {return {ok:true,summary:result.summary,fingerprint:result.fingerprint,confirmation:result.confirmation,runs:result.runs};}
  protectedError(message){return Object.assign(Error(message),{cleanupUnconfirmed:!!this.locked});}
  async handle(request) {
    if(request.action==='history-resume') {
      const ticket=this.tickets.get(this.locked);
      return ticket?{ok:true,pending:true,backupId:this.locked,backupPath:ticket.file,confirmation:ticket.confirmation,summary:ticket.summary,mode:ticket.mode}:{ok:true,pending:false};
    }
    if(this.locked && (request.action!=='history-delete' || request.backupId!==this.locked))throw this.protectedError('A cleanup result is unconfirmed. Retry that cleanup to reconcile it first.');
    if(request.action==='history-list')return {ok:true,runs:(await this.remote({action:'cleanup-preview',mode:'clean',runIds:[]})).runs};
    if(request.action==='history-preview')return this.metadata(await this.remote({action:'cleanup-preview',...this.scope(request)}));
    if(request.action==='history-backup') {
      const scope=this.scope(request);await this.queue.barrier();
      try {
        const file=await this.chooseFile();if(!file)return {ok:true,cancelled:true};
        const preview=await this.remote({action:'cleanup-preview',...scope});
        if(preview.fingerprint!==request.fingerprint)throw Error('Data changed. Refresh the preview before making the cleanup backup.');
        const local=structuredClone(this.readLocal());if(local.config)delete local.config.cloudWriterToken;
        const id=this.uuid();
        const payload={format:'TDQSYS cleanup backup',version:1,requestId:id,savedAt:new Date(this.now()).toISOString(),scope,server:preview.backup,local,localQueue:structuredClone(this.queue.state)};
        const bytes=Buffer.from(JSON.stringify(payload,null,2));this.files.writeFileSync(file,bytes,{mode:0o600});
        if(digest(this.files.readFileSync(file))!==digest(bytes))throw Error('Backup verification failed. Nothing was deleted.');
        this.tickets.set(id,{...scope,file,fileHash:digest(bytes),fingerprint:preview.fingerprint,confirmation:preview.confirmation,summary:preview.summary,expires:this.now()+600000,sent:false});
        return {ok:true,backupId:id,backupPath:file,...this.metadata(preview)};
      } finally {this.queue.remoteBusy=false;}
    }
    if(request.action==='history-delete') {
      const ticket=this.tickets.get(request.backupId);
      if(!ticket || (!ticket.sent && ticket.expires<this.now()))throw this.protectedError('Create and verify a fresh backup before deleting history.');
      if(request.confirmation!==ticket.confirmation)throw this.protectedError('Type the exact cleanup confirmation.');
      try{if(digest(this.files.readFileSync(ticket.file))!==ticket.fileHash)throw Error('The backup file changed. Create a new verified backup.');}
      catch(error){throw this.protectedError(error.message);}
      if(!this.locked)await this.queue.barrier();
      this.locked=request.backupId;this.queue.remoteBusy=true;ticket.sent=true;
      try {
        const result=await this.remote({action:'cleanup-apply',mode:ticket.mode,runIds:ticket.runIds,fingerprint:ticket.fingerprint,confirmation:request.confirmation,requestId:request.backupId});
        await this.reconcile(result);
        this.tickets.delete(request.backupId);this.locked=null;this.queue.remoteBusy=false;
        return {ok:true,...result,backupPath:ticket.file};
      } catch(error) {
        if(error.status>=400 && error.status<500 && error.status!==429){this.locked=null;this.queue.remoteBusy=false;ticket.sent=false;}
        throw Object.assign(Error(`${error.message} ${this.locked?'Cleanup outcome is unconfirmed; retry this same action. Queue changes are temporarily protected.':'Nothing was deleted by this rejected attempt; refresh preview if needed.'}`),{cleanupUnconfirmed:!!this.locked});
      }
    }
    throw Error('Unsupported history action.');
  }
}
module.exports={HistoryCleanup};
