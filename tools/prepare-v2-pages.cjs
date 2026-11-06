'use strict';
// Dedicated upload tree: the canonical public/version.json stays frozen for v1.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),wrapper=path.join(root,'.v2-pages'),target=path.join(wrapper,'public');
fs.mkdirSync(target,{recursive:true});
fs.cpSync(path.join(root,'public'),target,{recursive:true,filter:src=>!['downloads','.wrangler'].includes(path.basename(src))});
fs.copyFileSync(path.join(root,'releases/v2/version.json'),path.join(target,'version.json'));
fs.cpSync(path.join(root,'functions'),path.join(wrapper,'functions'),{recursive:true});
fs.cpSync(path.join(root,'shared'),path.join(wrapper,'shared'),{recursive:true});
fs.writeFileSync(path.join(wrapper,'wrangler.toml'),fs.readFileSync(path.join(root,'wrangler.v2.toml'),'utf8').replace('pages_build_output_dir = ".v2-pages"','pages_build_output_dir = "public"'));
console.log('Prepared isolated v2 Pages upload tree; legacy manifest unchanged.');
