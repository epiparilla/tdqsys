'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {PRODUCT,validateManifest,findOwnUninstaller}=require('../app/product');
const {read}=require('./helpers');
const valid={enabled:true,productId:PRODUCT.id,channel:'v2',version:'2.0.1',url:'https://github.com/epiparilla/tdqsys/releases/download/v2.0.1/tdqsys-v2-setup-2.0.1.exe',size:232000000,sha256:'a'.repeat(64)};
test('v2 installer, profile, processes and ports have separate identities',()=>{
 const pkg=require('../app/package.json');
 assert.equal(pkg.build.appId,PRODUCT.id);assert.equal(pkg.productName,PRODUCT.name);
 assert.equal(pkg.build.executableName+'.exe',PRODUCT.executable);
 assert.notEqual(PRODUCT.enginePort,8081);assert.notEqual(PRODUCT.speechPort,8001);
 const source=read('app/main.js');
 assert.ok(source.indexOf("app.setPath('userData',PROFILE_DIR)")<source.indexOf('app.requestSingleInstanceLock()'));
 assert.doesNotMatch(source,/Get-Process -Name 'TDQSYS','tts_server'/);
 assert.doesNotMatch(source,/killPortHolders\(/);
 assert.match(source,/PRODUCT\.speechExecutable/);
  assert.match(source,/TDQSYS-v2-firewall\.ps1/);
});
test('v2 OTA rejects v1, missing identity, wrong channel and untrusted installer',()=>{
 assert.equal(validateManifest(valid,'2.0.0').updateAvailable,true);
 for(const changed of [{productId:'com.tdqsys.queue'},{channel:'v1'},{productId:undefined},{version:'1.1.29'},{url:valid.url.replace('github.com','attacker.invalid')},{url:valid.url.replace('tdqsys-v2-setup','tdqsys-setup')},{size:0},{sha256:undefined}])assert.throws(()=>validateManifest({...valid,...changed},'2.0.0'));
 assert.equal(validateManifest({...valid,enabled:false},'2.0.0').updateAvailable,false);
 assert.equal(validateManifest({...valid,version:'2.0.0'},'2.0.0').updateAvailable,false);
 assert.equal(validateManifest(valid,'2.0.2').updateAvailable,false);
 assert.equal(validateManifest(valid,'2.1.0').updateAvailable,false);
});
test('v2 never discovers a v1 or unrelated uninstaller',()=>{
 const exe=path.join('separate','tdqsys-v2.exe');
 assert.equal(findOwnUninstaller(exe,()=>false),null);
 assert.equal(findOwnUninstaller(exe,p=>p===path.join('legacy','Uninstall TDQSYS.exe')),null);
 assert.equal(findOwnUninstaller(exe,()=>true),path.join('separate','Uninstall TDQSYS v2.exe'));
});
test('v1 feed remains frozen and v2 feed is not controlled by cloudBase or backup',()=>{
 assert.equal(JSON.parse(read('public/version.json')).version,'1.1.28');
 assert.equal(PRODUCT.updateUrl,'https://tdqsys-v2.pages.dev/version.json');
 assert.equal(JSON.parse(read('releases/v2/version.json')).enabled,false);
 const source=read('app/main.js');
 assert.match(source,/validateManifest\(m,current\)/);
 assert.match(source,/info.sha256/);
 assert.match(source,/Installed version does not match the update/);
});

test('v1 backups cannot replace v2 destination cloud or speech connections',()=>{
 const {prepareRestoredState}=require('../shared/restore'),{defaultState}=require('../shared/config');
 const backup=defaultState(),destination=defaultState();
 backup.config.cloudBase='https://tdqsys.pages.dev';backup.config.ttsPort=8001;
 const restored=prepareRestoredState(backup,destination);
 assert.equal(restored.config.cloudBase,'https://tdqsys-v2.pages.dev');assert.equal(restored.config.ttsPort,8002);
 assert.equal(backup.config.ttsPort,8001);
});
