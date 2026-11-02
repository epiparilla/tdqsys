'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const speech = require('../public/announcements');
const { prepareRestoredState } = require('../shared/restore');
const { defaultState } = require('../shared/config');
const { startEngine, loadAfJs } = require('./helpers');
let engine;
before(async()=>{engine=await startEngine();});
after(async()=>{if(engine)await engine.stop();});

test('announcement defaults preserve existing speech wording and pronunciation',()=>{
    const config={brands:[{key:'brand1',name:'Toyota',models:[{label:'RAV4',prefix:'RH',pronounce:'R H'}]}]};
    assert.equal(speech.textForQueue(config,'brand1',1,'RH01'),'Test driver R H 0 1 you may now approach the registration area for your test drive.');
});
test('templates expand prefix, ticket, destination and suffix in the saved order',()=>{
    const config={voice:'af_nova',prefix:'Now serving',template:'{ticket} at {counter} for {service}',suffix:'Thank you.'};
    assert.equal(speech.render(config,{ticket:'A001',counter:'Counter 3',service:'Customer Service'}),'Now serving A001 at Counter 3 for Customer Service Thank you.');
    for(const template of ['{unknown}','{ticket','{{ticket}}'])assert.throws(()=>speech.validate({...config,template}),/placeholder|braces/);
    assert.throws(()=>speech.validate({...config,template:'Counter 3'}),/ticket/);
});
test('speech and test-drive changes are recognized as actual Settings changes',()=>{
    const af=loadAfJs();const base=defaultState().config;
    assert.equal(af.afConfigEqual(base,{...base,announcements:{...speech.defaults,voice:'af_nova'}}),false);
    assert.equal(af.afConfigEqual(base,{...base,testDrive:{waiver:'Updated'}}),false);
    const edited=JSON.parse(JSON.stringify(base));edited.brands[0].models[0].shortname='PRINT';
    assert.equal(af.afConfigEqual(base,edited),false);
    const spoken=JSON.parse(JSON.stringify(base));spoken.brands[0].models[0].shortnamePronounce='G X three';
    assert.equal(af.afConfigEqual(base,spoken),false);
    assert.equal(require('../shared/config').normalizeModel(spoken.brands[0].models[0]).shortnamePronounce,'G X three');
});
test('restore preparation preserves destination identity without mutating the backup',()=>{
    const source=defaultState(),destination=defaultState();
    destination.config.cloudWriterToken='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const sourceId=source.config.instanceId;
    const restored=prepareRestoredState(source,destination);
    assert.equal(restored.config.instanceId,destination.config.instanceId);
    assert.equal(restored.config.cloudWriterToken,destination.config.cloudWriterToken);
    assert.equal(source.config.instanceId,sourceId);
    assert.notEqual(prepareRestoredState(source,null).config.instanceId,sourceId);
});
test('real restore keeps licensed installation A licensed when importing B',async()=>{
    const before=await(await fetch(engine.base+'/api/data')).json();
    const source=defaultState();source.config.cloudWriterToken='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const key=source.config.brands[0].key;source.queues[key]['1']=44;
    const response=await fetch(engine.base+'/api/restore-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:source,expectedInstanceId:before.config.instanceId})});
    assert.equal(response.status,200);const outcome=await response.json();
    const after=await(await fetch(engine.base+'/api/data')).json();
    assert.equal(after.config.instanceId,before.config.instanceId);
    assert.equal(after.config.cloudWriterToken,before.config.cloudWriterToken);
    assert.equal(after.queues[key]['1'],44);
    const licence=await(await fetch(engine.base+'/api/license')).json();assert.equal(licence.canWrite,true);
    const backup=JSON.parse(fs.readFileSync(path.join(engine.dataDir,outcome.backupFile),'utf8'));
    assert.equal(backup.config.instanceId,before.config.instanceId);
});
test('invalid speech templates cannot be saved by bypassing the Settings UI',async()=>{
    const before=await(await fetch(engine.base+'/api/data')).json();
    const invalid=structuredClone(before);invalid.config.announcements={...speech.defaults,template:'{unrecognised}'};
    const response=await fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(invalid)});
    assert.equal(response.status,400);
    assert.deepEqual(await(await fetch(engine.base+'/api/data')).json(),before);
});
test('unlicensed restore refuses to modify queue or identity',async()=>{
    const unlicensed=await startEngine({licensed:false});
    try{
        const before=await(await fetch(unlicensed.base+'/api/data')).json();
        const response=await fetch(unlicensed.base+'/api/restore-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:defaultState(),expectedInstanceId:before.config.instanceId})});
        assert.equal(response.status,403);assert.deepEqual(await(await fetch(unlicensed.base+'/api/data')).json(),before);
    }finally{await unlicensed.stop();}
});
