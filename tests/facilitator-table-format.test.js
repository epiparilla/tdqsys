'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readPublic}=require('./helpers');
const {extractFunction}=require('./helpers');
const vm=require('node:vm');

test('Master Table tags every rendered row with its current status and highlights only done and ongoing',()=>{
  const nodes=new Map(),rows=[];
  const element=()=>({dataset:{},appendChild(){},add(){},querySelectorAll(){return [];}});
  const byId=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,replaceChildren(){rows.length=0;},appendChild(row){rows.push(row);}});return nodes.get(id);};
  const statuses=['waiting','ongoing','done','no_show','cancelled'];
  const context={document:{createElement:element},byId,sortedRows:list=>list,cell(){},formatTicket:()=>'',Option:function(){},selectedModels:new Map(),applyLicenceLock(){},licenceStatus:{},snapshot:{entries:statuses.map((status,id)=>({id,status,registrations:{full_name:'Client'}})),models:[]}};
  vm.createContext(context);vm.runInContext(extractFunction(readPublic('test-drive-operations.js'),'renderMaster'),context);
  context.renderMaster();assert.deepEqual(rows.map(row=>row.dataset.status),statuses);
  context.snapshot.entries[1].status='done';context.renderMaster();assert.equal(rows[1].dataset.status,'done');
  const css=readPublic('facilitator.css');
  assert.match(css,/#master-rows tr\[data-status="done"\]>td\{background:#123d26;color:#fff\}/);
  assert.match(css,/#master-rows tr\[data-status="ongoing"\]>td\{background:#663600;color:#fff\}/);
  for(const status of ['waiting','no_show','cancelled'])assert.ok(!css.includes('#master-rows tr[data-status="'+status+'"]'));
});

test('Master Table, Print Queue and Sales Executives share compact cell and button formatting',()=>{
  const css=readPublic('facilitator.css').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].map(match=>({selectors:match[1].trim().split(',').map(value=>value.trim()),body:match[2]}));
  const cells=rules.find(rule=>rule.selectors.includes('#master td') && rule.selectors.includes('#prints td') && rule.selectors.includes('#sales td'));
  assert.ok(cells,'All three tables must use one shared cell rule');
  for(const page of ['master','prints','sales'])for(const tag of ['th','td'])assert.ok(cells.selectors.includes(`#${page} ${tag}`));
  assert.match(cells.body,/font-size:12px/);assert.match(cells.body,/padding:7px 6px/);
  const buttons=rules.find(rule=>['master','prints','sales'].every(page=>rule.selectors.includes(`#${page} td button`)));
  assert.ok(buttons,'All three tables must use one shared button rule');
  assert.match(buttons.body,/font-size:11px/);assert.match(buttons.body,/padding:4px/);assert.match(buttons.body,/margin:2px/);
});
