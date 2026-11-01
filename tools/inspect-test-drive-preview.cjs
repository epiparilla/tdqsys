'use strict';
// Prints configuration names and safe HTTP status only, never secret values.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{
  const exe=process.argv[2];
  const keys=spawnSync(exe,['projects','api-keys','--project-ref','pnyptdyfkftrcgjlaqnr','--output','json'],{encoding:'utf8',windowsHide:true});
  if(keys.status!==0)throw Error('Cannot inspect server key.');
  const serviceKey=JSON.parse(keys.stdout).find(item=>item.name==='service_role')?.api_key;
  const direct=await fetch('https://pnyptdyfkftrcgjlaqnr.supabase.co/rest/v1/rpc/tdqsys_public_registration_config',{
    method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_instance_id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'})});
  console.log('Direct Supabase config status:',direct.status);
  if(!direct.ok){const error=await direct.json();console.log('Database error code:',error.code);}
  for(const file of [path.join(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),path.join(process.env.USERPROFILE,'.wrangler/config/default.toml')]){
    if(!fs.existsSync(file))continue;
    const token=fs.readFileSync(file,'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];if(!token)continue;
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/e7e14bed97bb8f5583530bb47ebfb8e7/pages/projects/tdqsys',{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok)continue;
    const project=(await response.json()).result;
    for(const environment of ['production','preview'])console.log(environment+' variable names:',Object.keys(project.deployment_configs[environment].env_vars||{}).join(', '));
    console.log('Preview config source:',project.deployment_configs.preview.wrangler_config_hash||'dashboard');
    return;
  }
  throw Error('Cloudflare login unavailable.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
