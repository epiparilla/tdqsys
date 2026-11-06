'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root=path.resolve(__dirname,'..');

test('installer bundles the vendor setup and runs its skip-aware bootstrap after installation',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
  assert.equal(pkg.version,'2.0.0');
  assert.ok(pkg.build.extraResources.some(item=>item.to==='drivers/NiimbotPrinterDriverInstaller-3.0.2.1.exe'));
  assert.ok(pkg.build.extraResources.some(item=>item.to==='drivers/install-niimbot-driver.ps1'));
  const hook=fs.readFileSync(path.join(root,'app',pkg.build.nsis.include),'utf8');
  assert.match(hook,/!macro customInstall/);assert.match(hook,/nsExec::ExecToLog/);assert.match(hook,/resources\\drivers\\install-niimbot-driver.ps1/);
  assert.doesNotMatch(hook,/customUnInstall|pnputil.*delete|Remove-PrinterDriver/i);
});

test('driver bootstrap skips an existing driver or package and does not launch setup during detection', {skip:process.platform!=='win32'},()=>{
  const source=fs.readFileSync(path.join(root,'app/build/install-niimbot-driver.ps1'),'utf8');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tdqsys-driver-test-'));
  try {
    for(const [fixture,expected] of [['driver',0],['package',0],['other',1]]) {
      const mocks=`
function Get-ChildItem { param($LiteralPath,$ErrorAction)
  if ($LiteralPath -like '*Drivers*' -and '${fixture}' -eq 'driver') { [pscustomobject]@{PSChildName='NIIMBOT B1'} }
  if ($LiteralPath -like '*Uninstall' -and '${fixture}' -eq 'package') { [pscustomobject]@{PSPath='mock-vendor-package'} }
}
function Get-ItemProperty { param($LiteralPath,$ErrorAction) [pscustomobject]@{DisplayName='NiimbotPrinterDriver'} }
function Start-Process { throw 'Detection must never launch setup.' }
`;
      const file=path.join(directory,fixture+'.ps1');fs.writeFileSync(file,source.replace("$ErrorActionPreference = 'Stop'",mocks+"\n$ErrorActionPreference = 'Stop'"));
      const probe=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file,'-DetectOnly'],{encoding:'utf8',windowsHide:true,timeout:20000});
      assert.equal(probe.status,expected,probe.stderr||probe.stdout);assert.equal(probe.stderr,'');
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
