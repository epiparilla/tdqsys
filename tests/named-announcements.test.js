'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const named=require('../public/named-announcements');
const {extractFunction,startEngine,loadAfJs}=require('./helpers');

test('name mode defaults off with requested templates and validates independent name/ticket wording',()=>{
    assert.equal(named.normalize().enabled,false);
    assert.equal(named.defaults.nameTemplate,'Test driver, {name}, you may now approach the registration area to test drive the {counter}.');
    assert.equal(named.defaults.fallbackTemplate,named.defaults.nameTemplate.replace('{name}','{ticket}'));
    assert.equal(named.validate({enabled:true}).enabled,true);
    for(const change of [{fallbackTemplate:'{name}'},{nameTemplate:'{ticket}'},{nameTemplate:'{name} {bogus}'},{callbackFallbackTemplate:'{ticket} {name}'},{nameTemplate:'{name}'+ 'x'.repeat(600)}])assert.throws(()=>named.validate(change));
});

test('Settings hydrates/collects all name fields and disabled mode is retained',()=>{
    const nodes=Object.fromEntries(Object.keys(named.defaults).map(key=>['named-'+key,{value:'',checked:false}]));
    const context={TdqNamedSpeech:named,document:{getElementById:id=>nodes[id] ||= {}},window:{}};
    vm.runInNewContext(fs.readFileSync('public/settings-named-speech.js','utf8'),context);
    context.window.TdqNamedSettings.hydrate({enabled:true});assert.equal(nodes['named-enabled'].checked,true);
    assert.equal(context.window.TdqNamedSettings.collect().fallbackTemplate,named.defaults.fallbackTemplate);
    nodes['named-enabled'].checked=false;assert.equal(context.window.TdqNamedSettings.collect().enabled,false);
    context.window.TdqNamedSettings.hydrate();assert.equal(nodes['named-enabled'].checked,false);
    const af=loadAfJs();assert.equal(af.afConfigEqual({},{namedAnnouncements:{enabled:true}}),false);
});

test('private native call takes client name from stored ticket, never renderer-supplied text',async()=>{
    const source=fs.readFileSync('app/main.js','utf8');let payload;
    const context={getSpeechDucker:()=>({begin:()=>()=>{}}),TTS_PORT:8002,TTS_PLAYBACK_TOKEN:'private',AbortSignal,
        fetch:async(_url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({queued:true,cacheReady:true})};}};
    vm.createContext(context);vm.runInContext(extractFunction(source,'queueTicketSpeech'),context);
    await context.queueTicketSpeech('ongoing',{brand_key:'brand1',unit_index:1},3,'Juan Dela Cruz');
    assert.equal(payload.clientName,'Juan Dela Cruz');assert.equal(payload.number,3);
    assert.match(extractFunction(source,'localQueueAction'),/ticket.entry.registrations\?\.full_name/);
});

test('real isolated engine validates name settings before save and preserves existing queues',async()=>{
    const engine=await startEngine();
    try{
        const before=await(await fetch(engine.base+'/api/data')).json();
        const valid=structuredClone(before);valid.config.namedAnnouncements=named.validate({enabled:true});
        let response=await fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});
        assert.equal(response.status,200);const after=await(await fetch(engine.base+'/api/data')).json();
        assert.equal(after.config.namedAnnouncements.enabled,true);assert.deepEqual(after.queues,before.queues);
        valid.config.namedAnnouncements.fallbackTemplate='{name}';
        response=await fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid)});
        assert.equal(response.status,400);assert.deepEqual(await(await fetch(engine.base+'/api/data')).json(),after);
    }finally{await engine.stop();}
});
