'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/main.js'),'utf8');
const stopSource=source.slice(source.indexOf('function stopOwnedProcessTree('),source.indexOf('\nfunction cleanup()'));
function fixture(platform='win32',fail=false){
 const calls=[];
 const scope={process:{platform},log:msg=>calls.push(['log',msg]),execFileSync:(file,args,options)=>{calls.push([file,args,options]);if(fail)throw Error('already gone');}};
 vm.runInNewContext(stopSource,scope);
 return {calls,stop:scope.stopOwnedProcessTree};
}
test('Windows stops the entire owned tree without killing the PyInstaller launcher first',()=>{
 const f=fixture();let killed=false;f.stop({pid:4321,exitCode:null,kill(){killed=true;}});
 assert.equal(killed,false);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0][0],'taskkill.exe');assert.deepEqual(Array.from(f.calls[0][1]),['/PID','4321','/T','/F']);
 assert.equal(f.calls[0][2].windowsHide,true);assert.equal(f.calls[0][2].timeout,10000);
});
test('shutdown skips absent/dead/unspawned children and never sweeps by image or port',()=>{
 const f=fixture();for(const child of [null,{}, {pid:undefined,exitCode:null},{pid:-1,exitCode:null},{pid:43,exitCode:0}])f.stop(child);
 assert.equal(f.calls.length,0);assert.doesNotMatch(stopSource,/\/IM|netstat|Get-Process/);
 const failed=fixture('win32',true);failed.stop({pid:1234,exitCode:null,kill(){throw Error('must not orphan launcher');}});
 assert.equal(failed.calls.length,2);
});
test('non-Windows cleanup still uses child termination',()=>{
 const f=fixture('linux');let killed=false;f.stop({pid:1234,exitCode:null,kill(){killed=true;}});assert.equal(killed,true);
});
test('quit and restart share tree cleanup; pending engine and speech restarts refuse to spawn during quit',()=>{
 const cleanup=source.slice(source.indexOf('function cleanup()'),source.indexOf('async function queueTicketSpeech'));
 assert.match(cleanup,/\[engineProcess, ttsProcess\]\.forEach\(stopOwnedProcessTree\)/);
 assert.doesNotMatch(cleanup,/\.kill\(/);
 assert.match(source,/function startEngine\(\) \{\s*if \(app.isQuitting\) return/);
 assert.match(source,/function startTTS\(\) \{\s*if \(app.isQuitting\) return/);
 const restart=source.slice(source.indexOf('function restartSystem()'),source.indexOf('function stopOwnedProcessTree'));
 assert.match(restart,/stopOwnedProcessTree\(ttsProcess\)/);assert.doesNotMatch(restart,/\.kill\(/);
});
