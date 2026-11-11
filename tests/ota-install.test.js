'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {read}=require('./helpers');
const {findOwnUninstaller}=require('../app/product');

function updater(uninstaller,info={updateAvailable:true,url:'https://example.invalid/verified-installer'}) {
  const source=read('app/main.js'),handlers={},calls=[];
  const win={isDestroyed:()=>false,webContents:{send:(...args)=>calls.push(['progress',...args])}};
  const context={ipcMain:{handle:(name,handler)=>{handlers[name]=handler;}},BrowserWindow:{fromWebContents:()=>win},
    checkForUpdates:async()=>info,UNINSTALLER_EXE:uninstaller,applyUpdate:async(value,target)=>{calls.push(['install',value,target]);},
    shell:{openExternal:()=>{throw Error('Update must not open a browser.');}}};
  vm.runInNewContext(source.slice(source.indexOf("ipcMain.handle('af:installUpdate'"),source.indexOf('// ---- App info:')),context);
  return {run:()=>handlers['af:installUpdate']({sender:{}}),calls,win,context};
}

test('NSIS executable-name uninstaller selects background installation, never a browser download',async()=>{
  const folder=path.join('installed','tdqsys-v2');
  const actual=path.join(folder,'Uninstall tdqsys-v2.exe');
  const found=findOwnUninstaller(path.join(folder,'tdqsys-v2.exe'),candidate=>candidate===actual);
  assert.equal(found,actual);
  const fixture=updater(found);assert.equal((await fixture.run()).ok,true);
  assert.equal(fixture.calls[0][0],'install');assert.equal(fixture.calls[0][2],fixture.win);
});

test('real portable mode explains setup requirement without opening a save dialog',async()=>{
  const fixture=updater(null),result=await fixture.run();
  assert.equal(result.ok,false);assert.equal(result.reason,'portable');assert.match(result.error,/setup installer once/);assert.equal(fixture.calls.length,0);
});

test('no update and installer failures stay in-app without a browser redirect',async()=>{
  const fixture=updater('own-uninstaller',{updateAvailable:false});assert.equal((await fixture.run()).reason,'no-update');assert.equal(fixture.calls.length,0);
  const failure=updater('own-uninstaller');failure.context.applyUpdate=async()=>{throw Error('checksum failed');};
  const result=await failure.run();assert.equal(result.reason,'error');assert.equal(result.error,'checksum failed');assert.equal(failure.calls[0][0],'progress');
});
