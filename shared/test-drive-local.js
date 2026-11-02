'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const copy = value => structuredClone(value);

function operatingDay(now, zone='Asia/Manila') {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}

function applyOperation(snapshot, operation) {
    if(snapshot?.run?.id!==operation.runId)return;
    const entry=snapshot.entries.find(entry=>entry.id===operation.entryId);
    if(!entry)return;
    if(operation.action==='ongoing') {
        for(const previous of snapshot.entries)if(previous.vehicle_model_id===entry.vehicle_model_id && previous.status==='ongoing' && previous.id!==entry.id)previous.status='done';
        entry.status='ongoing';
        snapshot.modelDisplays ||= [];
        const display=snapshot.modelDisplays.find(item=>item.vehicle_model_id===entry.vehicle_model_id);
        if(display)display.queue_number=entry.queue_number;
        else snapshot.modelDisplays.push({vehicle_model_id:entry.vehicle_model_id,queue_number:entry.queue_number});
        snapshot.display={...snapshot.display,active_test_drive_entry_id:entry.id,queue_run_id:operation.runId};
    } else entry.status=operation.status;
    entry.status_changed_at=operation.createdAt;
}

class LocalTestDrive {
    constructor({directory,instanceId,remote,now=()=>new Date(),id=randomUUID}) {
        if(!/^[0-9a-f-]{1,64}$/i.test(instanceId))throw Error('Invalid local queue identity.');
        this.file=path.join(directory,`test-drive-${instanceId}.json`);
        this.remote=remote;this.now=now;this.id=id;this.options={};this.running=null;this.remoteBusy=false;
        this.lastError=null;this.retryAt=0;this.failures=0;this.pollAt=0;
        this.state={schema:1,instanceId,snapshot:null,outbox:[],archives:[],displayPending:[],lastSyncedAt:null};
        if(fs.existsSync(this.file)) {
            const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
            if(saved.schema!==1 || saved.instanceId!==instanceId || !Array.isArray(saved.outbox))throw Error('Local queue file is invalid; it has been retained for recovery.');
            this.state=saved;
        }
    }
    save(next) {
        fs.mkdirSync(path.dirname(this.file),{recursive:true});
        const temporary=`${this.file}.${randomUUID()}.tmp`;
        let fd;
        try {
            fd=fs.openSync(temporary,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
            fs.renameSync(temporary,this.file);this.state=next;
        } finally {if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    }
    status() {
        return {ready:!!this.state.snapshot?.run && this.state.snapshot.run.operating_day===operatingDay(this.now(),this.state.snapshot.timezone),pending:this.state.outbox.length,
            blocked:this.state.outbox.some(operation=>operation.blocked),lastError:this.lastError || this.state.outbox.find(operation=>operation.blocked)?.error || null,
            lastSyncedAt:this.state.lastSyncedAt,syncing:!!this.running,
            earlierRunPending:this.state.outbox.some(operation=>operation.runId!==this.state.snapshot?.run?.id)};
    }
    view() {
        const snapshot=copy(this.state.snapshot || {run:null,entries:[],models:[],printJobs:[],seCheckins:[]});
        for(const operation of this.state.outbox)applyOperation(snapshot,operation);
        if(snapshot.run && snapshot.run.operating_day!==operatingDay(this.now(),snapshot.timezone)) {
            snapshot.entries=[];snapshot.printJobs=[];snapshot.seCheckins=[];
        }
        snapshot.localSync=this.status();return snapshot;
    }
    setOptions(options={}) {
        const next={history:!!options.history,includeAgentCodes:!!options.includeAgentCodes,includePrintCodes:!!options.includePrintCodes,
            includeSalesExecutives:!!options.includeSalesExecutives,salesHistory:!!options.salesHistory};
        if(JSON.stringify(next)!==JSON.stringify(this.options))this.pollAt=0;
        this.options=next;
    }
    ticket(entryId) {
        if(this.remoteBusy)throw Error('Finish the current registration/print/reset action first.');
        const snapshot=this.view();
        if(!snapshot.run || snapshot.run.status!=='active')throw Error('Connect once to load the current queue run.');
        if(snapshot.run.operating_day!==operatingDay(this.now(),snapshot.timezone))throw Error('Connect to load today\'s queue run before calling clients.');
        if(snapshot.localSync.blocked)throw Error('Unsynced queue actions need review in Event Setup / QR Codes.');
        const entry=snapshot.entries.find(entry=>entry.id===entryId && entry.instance_id===this.state.instanceId && entry.queue_run_id===snapshot.run.id);
        if(!entry || !['waiting','ongoing'].includes(entry.status))throw Error('This client is no longer waiting or ongoing in the local run.');
        const model=snapshot.models.find(model=>model.id===entry.vehicle_model_id);
        if(!model)throw Error('Vehicle model is not available in the local queue.');
        return {entry,model,run:snapshot.run};
    }
    commit(request) {
        const {entry,model,run}=this.ticket(request.entryId);
        if(request.action!=='ongoing' && !(request.action==='status' && ['done','no_show','cancelled'].includes(request.status)))throw Error('Unsupported local queue action.');
        const operation={id:this.id(),runId:run.id,entryId:entry.id,action:request.action,createdAt:this.now().toISOString(),
            ...(request.action==='status'?{status:request.status}:{})};
        const next=copy(this.state);next.outbox.push(operation);
        if(operation.action==='ongoing') {
            next.displayPending=next.displayPending.filter(item=>item.modelId!==model.id);
            next.displayPending.push({operationId:operation.id,modelId:model.id,brandKey:model.brand_key,unit:model.unit_index,fullName:model.full_name,number:entry.queue_number,runId:run.id});
        }
        this.save(next);
        return {entry:this.view().entries.find(item=>item.id===entry.id),model,operationId:operation.id};
    }
    markDisplayApplied(items) {
        const ids=new Set(items.map(item=>item.operationId));const next=copy(this.state);
        next.displayPending=next.displayPending.filter(item=>!ids.has(item.operationId));this.save(next);
    }
    prepareDisplayProjection() {
        const snapshot=this.state.snapshot;
        if(!snapshot?.run)return;
        const day=operatingDay(this.now(),snapshot.timezone);
        const current=snapshot.run.operating_day===day;
        const context=current ? `${day}:${snapshot.run.id}` : `${day}:awaiting-run`;
        if(this.state.displayContext===context)return;
        const view=this.view(),next=copy(this.state);
        // The TV state is separate from the table snapshot. Persist the boundary
        // projection too, so an offline midnight/restart cannot retain old numbers.
        next.displayContext=context;
        next.displayPending=(snapshot.models || []).map(model=>({operationId:this.id(),modelId:model.id,
            brandKey:model.brand_key,unit:model.unit_index,fullName:model.full_name,
            number:current ? (view.modelDisplays || []).find(item=>item.vehicle_model_id===model.id)?.queue_number || 0 : 0,
            runId:snapshot.run.id}));
        this.save(next);
    }
    acceptSnapshot(snapshot,options={}) {
        if(!snapshot || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.models))throw Error('Invalid cloud queue snapshot.');
        if(snapshot.entries.some(entry=>entry.instance_id!==this.state.instanceId))throw Error('Cloud snapshot contains another location.');
        if(snapshot.run?.instance_id && snapshot.run.instance_id!==this.state.instanceId)throw Error('Cloud run belongs to another location.');
        if(snapshot.models.some(model=>model.instance_id && model.instance_id!==this.state.instanceId))throw Error('Cloud models belong to another location.');
        const next=copy(this.state),previous=next.snapshot;
        // Basic polling must not erase private detail already loaded for a view.
        if(previous?.run?.id===snapshot.run?.id) {
            for(const entry of snapshot.entries)if(entry.agentCode===undefined) {
                const cached=previous.entries.find(old=>old.id===entry.id);if(cached?.agentCode)entry.agentCode=cached.agentCode;
            }
            if(!options.includeSalesExecutives)snapshot.seCheckins=previous.seCheckins || [];
            if(!options.includePrintCodes)for(const job of snapshot.printJobs || []) {
                const cached=previous.printJobs?.find(old=>old.id===job.id);if(cached?.seCode)job.seCode=cached.seCode;
            }
        }
        next.snapshot=copy(snapshot);next.lastSyncedAt=this.now().toISOString();
        for(const operation of next.outbox)if(operation.runId!==snapshot.run?.id) {
            operation.blocked=true;operation.error='The cloud queue run changed. Export/review and archive earlier-run actions in Event Setup.';
        }
        next.displayPending=next.displayPending.filter(item=>item.runId===snapshot.run?.id);
        this.save(next);
    }
    async flush() {
        while(this.state.outbox.length) {
            const operation=this.state.outbox[0];if(operation.blocked)throw Object.assign(Error(operation.error),{status:409});
            const {blocked,error,...payload}=operation;
            const result=await this.remote({action:'sync-local-operation',operation:payload});
            if(result.operationId!==operation.id)throw Error('Cloud did not acknowledge the local operation; it remains saved.');
            const next=copy(this.state);
            // Apply the acknowledged operation before removing its pending overlay.
            applyOperation(next.snapshot,operation);next.outbox=next.outbox.filter(item=>item.id!==operation.id);this.save(next);
        }
    }
    async sync({force=false}={}) {
        if(this.running)return this.running;
        if(!force && this.now().getTime()<this.retryAt)return;
        this.running=this.performSync(force).finally(()=>{this.running=null;});return this.running;
    }
    async performSync(force) {
        try {
            if(this.state.outbox.some(operation=>operation.blocked)) {
                if(force || this.now().getTime()>=this.pollAt) {
                    const options=copy(this.options);this.acceptSnapshot(await this.remote({action:'snapshot',...options}),options);this.pollAt=this.now().getTime()+5000;
                }
                return;
            }
            await this.flush();
            if(force || this.now().getTime()>=this.pollAt) {
                const options=copy(this.options);this.acceptSnapshot(await this.remote({action:'snapshot',...options}),options);this.pollAt=this.now().getTime()+5000;
            }
            this.failures=0;this.retryAt=0;this.lastError=null;
        } catch(error) {
            this.lastError=error.message;this.failures++;
            this.retryAt=this.now().getTime()+Math.min(30000,1000*2**Math.min(this.failures-1,5));
            if(error.status>=400 && error.status<500 && error.status!==429 && this.state.outbox.length) {
                const next=copy(this.state);next.outbox[0].blocked=true;next.outbox[0].error=error.message;this.save(next);
                // A fresh snapshot can reveal a reset/day change without losing the journal.
                try {const options=copy(this.options);this.acceptSnapshot(await this.remote({action:'snapshot',...options}),options);}catch{}
            }
        }
    }
    async barrier() {
        if(this.remoteBusy)throw Error('Another registration or print operation is in progress.');
        this.remoteBusy=true;
        try {
            if(this.running)await this.running;
            await this.flush();
        } catch(error) {this.remoteBusy=false;throw Error(`Local queue changes must sync before this action: ${error.message}`);}
    }
    archiveEarlierRun(confirm) {
        if(confirm!==true)throw Error('Confirm archiving earlier-run actions first.');
        const next=copy(this.state),old=next.outbox.filter(operation=>operation.runId!==next.snapshot?.run?.id);
        if(!old.length)throw Error('Only actions from earlier runs can be archived. Current-run conflicts must be resolved first.');
        next.archives.push({at:this.now().toISOString(),operations:old});
        const ids=new Set(old.map(operation=>operation.id));next.outbox=next.outbox.filter(operation=>!ids.has(operation.id));this.save(next);
        this.lastError=null;this.retryAt=0;return {archived:old.length};
    }
    retryBlocked() {
        const next=copy(this.state);
        for(const operation of next.outbox)if(operation.runId===next.snapshot?.run?.id) {delete operation.blocked;delete operation.error;}
        this.save(next);this.lastError=null;this.retryAt=0;return {retrying:true};
    }
}
module.exports={LocalTestDrive,applyOperation,operatingDay};
