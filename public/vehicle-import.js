(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TdqVehicleImport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const headers=['Brand','Label','Shortname','Shortname pronunciation','Prefix','Prefix pronunciation'];
 function csv(text){
  const rows=[];let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
   const char=text[i];
   if(quoted){if(char==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=char;continue;}
   if(char==='"'){if(value||closed)throw Error('Invalid CSV quoting.');quoted=true;continue;}
   if(char===','||char==='\n'||char==='\r'){row.push(value);value='';closed=false;if(char!==','){if(row.some(cell=>cell.trim()))rows.push(row);row=[];if(char==='\r'&&text[i+1]==='\n')i++;}continue;}
   if(closed)throw Error('Unexpected text after a quoted CSV field.');value+=char;
  }
  if(quoted)throw Error('Unclosed CSV quote.');row.push(value);if(row.some(cell=>cell.trim()))rows.push(row);return rows;
 }
 function parse(text,current=[]){
  if(typeof text!=='string'||text.length>100000)throw Error('Use a vehicle file no larger than 100 KB.');text=text.replace(/^\uFEFF/,'');
  let records;
  if(/^[\s]*[\[{]/.test(text)){
   const data=JSON.parse(text);
   if(data&&Array.isArray(data.brands))records=data.brands.flatMap(brand=>{if(!Array.isArray(brand.models))throw Error('Each JSON brand needs a models array.');return brand.models.map(model=>({...model,brand:brand.name}));});
   else if(Array.isArray(data))records=data;else throw Error('JSON must contain a brands array or a flat vehicle array.');
   records=records.map(row=>[row.brand,row.label,row.shortname,row.shortnamePronounce,row.prefix,row.pronounce]);
  }else{
   const rows=csv(text),head=rows.shift()||[];
   const normalize=value=>value.trim().toLowerCase().replace(/[ _-]/g,'');
   const indexes=headers.map(name=>head.findIndex(value=>normalize(value)===normalize(name)));
   if(indexes.some(index=>index<0)||head.length!==headers.length||new Set(head.map(normalize)).size!==6)throw Error('CSV needs exactly these headers: '+headers.join(', '));
   records=rows.map((row,i)=>{if(row.length!==6)throw Error(`CSV row ${i+2} must have six fields.`);return indexes.map(index=>row[index]);});
  }
  if(!records.length||records.length>12)throw Error('Import 1–12 vehicles total.');
  const brands=[],names=new Map();
  records.forEach((record,index)=>{
   const limits=[120,160,36,160,20,160];
   const values=record.map((value,i)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>limits[i]||/[<>\u0000-\u001f]/.test(value)||/^[=+@-]/.test(value.trim()))throw Error(`Vehicle ${index+1}: fill all six fields within their size limits; do not use markup or spreadsheet formulas.`);return value.trim();});
   const [name,label,shortname,shortnamePronounce,prefix,pronounce]=values,key=name.toLowerCase();
   if(!names.has(key)){
    if(brands.length===2)throw Error('Use at most two brands.');
    const existing=current.find(brand=>brand.name.toLowerCase()===key),brand={key:'brand'+(brands.length+1),name,color:existing?.color||['#EB0A1E','#B0B0B0'][brands.length],models:[]};
    if(existing?.display)brand.display=JSON.parse(JSON.stringify(existing.display));brands.push(brand);names.set(key,brand);
   }
   const brand=names.get(key);
   if(brand.models.some(model=>model.label.toLowerCase()===label.toLowerCase()||model.prefix.toLowerCase()===prefix.toLowerCase()))throw Error(`Vehicle ${index+1}: duplicate label or prefix within ${name}.`);
   brand.models.push({label,shortname,shortnamePronounce,prefix,pronounce});
  });return brands;
 }
 function stringify(brands){
  const rows=brands.flatMap(brand=>brand.models.map(model=>[brand.name,model.label,model.shortname||model.label,model.shortnamePronounce||model.shortname||model.label,model.prefix,model.pronounce||model.prefix.split('').join(' ')]));
  return [headers,...rows].map(row=>row.map(value=>'"'+String(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
 }
 return {parse,stringify,headers};
});
