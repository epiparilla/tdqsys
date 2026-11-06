'use strict';
const path=require('node:path');
const PRODUCT=Object.freeze({
  id:'com.tdqsys.queue.v2',name:'TDQSYS v2',channel:'v2',major:2,
  executable:'tdqsys-v2.exe',speechExecutable:'tdqsys-v2-speech.exe',
  enginePort:8082,speechPort:8002,
  cloudBase:'https://tdqsys-v2.pages.dev',
  updateUrl:'https://tdqsys-v2.pages.dev/version.json'
});
function validateManifest(manifest,current) {
  if(manifest?.enabled!==true)return {updateAvailable:false};
  if(manifest.productId!==PRODUCT.id || manifest.channel!==PRODUCT.channel)throw Error('Update belongs to another TDQSYS product line.');
  if(!/^2\.[0-9]+\.[0-9]+$/.test(manifest.version || ''))throw Error('Invalid v2 update version.');
  const newer=manifest.version.split('.').some((part,i,parts)=>Number(part)>Number(current.split('.')[i] || 0) && parts.slice(0,i).every((p,j)=>Number(p)===Number(current.split('.')[j] || 0)));
  if(!newer)return {updateAvailable:false,latest:manifest.version};
  const url=new URL(manifest.url);
  if(url.protocol!=='https:' || url.hostname!=='github.com' || url.pathname!==`/epiparilla/tdqsys/releases/download/v${manifest.version}/tdqsys-v2-setup-${manifest.version}.exe` || url.search || url.hash)throw Error('Untrusted v2 installer URL.');
  if(!Number.isSafeInteger(manifest.size) || manifest.size<1 || !/^[a-f0-9]{64}$/.test(manifest.sha256 || ''))throw Error('Update requires an exact byte size and SHA-256 checksum.');
  return {updateAvailable:true,latest:manifest.version,url:url.href,size:manifest.size,sha256:manifest.sha256,notes:String(manifest.notes || '')};
}
function findOwnUninstaller(execPath,exists) {
  const candidate=path.join(path.dirname(execPath),`Uninstall ${PRODUCT.name}.exe`);
  return exists(candidate)?candidate:null;
}
module.exports={PRODUCT,validateManifest,findOwnUninstaller};
