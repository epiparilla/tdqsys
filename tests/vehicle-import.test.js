'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('../public/vehicle-import');
const row={brand:'GEELY',label:'Geely EX5',shortname:'EX5',shortnamePronounce:'E X Five',prefix:'EXV',pronounce:'E X V'};
test('vehicle CSV and JSON preserve all six fields, quoted commas, BOM, ordering and matching branding',()=>{
 const current=[{name:'GEELY',color:'#00B5E2',display:{brandFont:'geely',headerMode:'text'}}];
 const rows=[row,{...row,brand:'LYNK & CO',label:'Model, "Seven"',prefix:'LC'}];
 const brands=api.parse(JSON.stringify(rows),current),csv=api.stringify(brands),restored=api.parse('\uFEFF'+csv+'\r\n',current);
 assert.deepEqual(restored,brands);assert.equal(brands[0].models[0].shortnamePronounce,'E X Five');assert.equal(brands[0].models[0].pronounce,'E X V');assert.equal(brands[0].color,'#00B5E2');assert.deepEqual(brands[0].display,current[0].display);assert.equal(brands[1].key,'brand2');
 brands[0].display.brandFont='Arial';assert.equal(current[0].display.brandFont,'geely');
 const nested=api.parse(JSON.stringify({instanceId:'IGNORE',cloudWriterToken:'IGNORE',brands:[{name:row.brand,models:[row]}]}));assert.equal(nested[0].name,'GEELY');assert.equal(JSON.stringify(nested).includes('IGNORE'),false);
});
test('vehicle import rejects invalid/unsafe files atomically and enforces two brands/twelve cars',()=>{
 for(const invalid of ['',JSON.stringify([]),'{"brands":[{}]}',JSON.stringify([{...row,shortname:''}]),JSON.stringify([{...row,label:'<img src=x>'}]),JSON.stringify([{...row,label:'=WEBSERVICE(x)'}]),JSON.stringify([row,row]),JSON.stringify([row,{...row,brand:'B'},{...row,brand:'C'}]),'"unclosed',api.headers.join(',')+'\nA,B,C,D,E', 'x'.repeat(100001)])assert.throws(()=>api.parse(invalid));
 const twelve=Array.from({length:12},(_,index)=>({...row,label:'Car '+index,prefix:'P'+index}));assert.equal(api.parse(JSON.stringify(twelve))[0].models.length,12);assert.throws(()=>api.parse(JSON.stringify([...twelve,{...row,label:'Extra',prefix:'ZZ'}])),/1–12/);
 assert.match(api.stringify([{name:'=BAD()',models:[row]}]),/"'=BAD\(\)"/);
});
