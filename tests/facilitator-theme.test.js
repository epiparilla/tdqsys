'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {FACILITATOR_PAGES,injectFacilitatorBootstrap}=require('../shared/facilitator-theme');
const {PUBLIC,startEngine}=require('./helpers');
const shell=fs.readFileSync(path.join(PUBLIC,'facilitator-shell.js'),'utf8');

test('every staff page receives its saved branding before CSS or cloud requests, without exposing private configuration',async()=>{
  const engine=await startEngine();
  try{
    const state=await(await fetch(engine.base+'/api/data')).json();
    state.config.brands=[{key:'brand1',name:'GEELY',color:'#00adbc',models:[{label:'GX3',prefix:'AA',pronounce:'A A'}]},
      {key:'brand2',name:'LEXUS',color:'#adba11',models:[{label:'NX',prefix:'BB',pronounce:'B B'}]}];
    state.config.testDrive={sheetsUrl:'https://docs.google.com/spreadsheets/d/private-destination/edit'};
    const saved=await fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});assert.equal(saved.status,200);
    for(const file of FACILITATOR_PAGES){
      const response=await fetch(engine.base+'/'+file),html=await response.text();
      assert.equal(response.headers.get('Cache-Control'),'no-store');
      const color=file==='dashboard-brand2.html'?'#adba11':'#00adbc';assert.ok(html.includes(`--brand-accent:${color}`));
      assert.ok(html.indexOf('TDQSYS_FACILITATOR_BOOTSTRAP=')<html.indexOf('href="facilitator.css"'));
      assert.doesNotMatch(html,/href="style.css"/);assert.equal(html.includes(state.config.cloudWriterToken),false);assert.equal(html.includes('private-destination'),false);
    }
    state.config.brands[0].color='#008877';
    await fetch(engine.base+'/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
    assert.match(await(await fetch(engine.base+'/dashboard.html')).text(),/--brand-accent:#008877/);
    const font=await fetch(engine.base+'/vendor/fonts/Inter-latin-variable.woff2');assert.equal(font.status,200);assert.equal(font.headers.get('Content-Type'),'font/woff2');
  }finally{await engine.stop();}
});

test('first shell render uses GEELY branding immediately even when no cloud snapshot is available',()=>{
  const elements={};let inserted=false,color;
  const context={window:{TDQSYS_FACILITATOR_BOOTSTRAP:{brands:[{key:'brand1',name:'GEELY',color:'#00adbc'}],sheetsConfigured:true}},
    document:{documentElement:{style:{setProperty:(_key,value)=>{color=value;}}},body:{dataset:{view:'board'},insertAdjacentHTML:()=>{inserted=true;}},getElementById:id=>{
      assert.ok(inserted);return elements[id] ||= {setAttribute(){},removeAttribute(){}};
    }}};
  vm.runInNewContext(shell,context);
  assert.equal(color,'#00adbc');assert.equal(elements['brand-controls-title'].textContent,'GEELY CONTROLS');assert.equal(elements['brand1-link'].textContent,'GEELY Queue Board');
  assert.match(elements['sheets-status'].textContent,/destination saved/);
});

test('bootstrap escapes configured names and rejects unsafe CSS colors',()=>{
  const html=injectFacilitatorBootstrap('<head><!--TDQSYS_FACILITATOR_BOOTSTRAP--></head>',{brands:[{key:'brand1',name:'</script><script>unsafe()</script>',color:'red;}</style><script>unsafe()</script>',models:[{}]}]});
  assert.doesNotMatch(html,/<script>unsafe\(\)/);assert.match(html,/--brand-accent:#EB0A1E/);assert.match(html,/\\u003c\/script\\u003e/);
});

test('staff styles use a bundled font and retain space for delayed status text',()=>{
  const css=fs.readFileSync(path.join(PUBLIC,'facilitator.css'),'utf8');
  assert.doesNotMatch(css,/@import|https:\/\/fonts/);assert.match(css,/Inter-latin-variable.woff2/);assert.match(css,/min-height:1.5em/);
  assert.equal(fs.readFileSync(path.join(PUBLIC,'vendor/fonts/Inter-latin-variable.woff2')).subarray(0,4).toString(),'wOF2');
});
