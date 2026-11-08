'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readPublic,read,extractFunction}=require('./helpers');

test('blank statements survive desktop Settings hydration and cloud configuration',()=>{
 const html=readPublic('settings.html');
 for(const key of ['waiver','terms']){
  assert.match(html,new RegExp('testDrive\\?\\.'+key+' \\?\\?'));
  assert.doesNotMatch(html.match(new RegExp('<textarea id="cfg-'+key+'"[^>]*>'))[0],/required/);
 }
 assert.doesNotMatch(html,/Waiver and Terms and Conditions cannot be empty/);
 const context={};vm.createContext(context);vm.runInContext(extractFunction(read('app/main.js'),'buildTestDriveSettings'),context);
 const blank=context.buildTestDriveSettings({testDrive:{waiver:'',terms:''}});
 assert.equal(blank.waiver,'');assert.equal(blank.terms,'');
 assert.match(context.buildTestDriveSettings({}).waiver,/Lorem ipsum/);
});

test('client form hides only blank questions and skips consent step in both navigation directions',async()=>{
 for(const [waiverStatement,termsAndConditions] of [['Waiver','Terms'],['','Terms'],['Waiver',''],['',''],['  ','\n']]){
  const nodes=new Map(),fields=new Map(),sections=[0,1,2,3].map(step=>({dataset:{step:String(step)}}));
  const node=id=>{if(!nodes.has(id))nodes.set(id,{appendChild(){},append(){}});return nodes.get(id);};
  const field=name=>{if(!fields.has(name))fields.set(name,{checked:name==='privacyAccepted',required:true,disabled:false,reportValidity(){return this.disabled || !this.required || this.checked;}});return fields.get(name);};
  const form=node('registration');form.elements={namedItem:field};form.querySelector=()=>({checked:true});
  const config={models:[{id:'model',name:'Car'}],waiverStatement,termsAndConditions};
  const context={URL,location:{href:'https://example.test/?id=abc'},crypto:{randomUUID:()=> 'request-1234'},sessionStorage:{getItem(){},setItem(){}},fetch:async()=>({ok:true,json:async()=>config}),document:{getElementById:node,createElement:()=>({append(){}}),querySelectorAll:()=>sections,querySelector:selector=>({querySelectorAll:()=>selector.includes('"2"')?[field('waiverAccepted'),field('printedWaiverAccepted'),field('termsAccepted')]:[]})}};
  vm.runInNewContext(readPublic('test-drive-registration.js'),context);await new Promise(resolve=>setImmediate(resolve));
  for(const [key,text] of [['waiver',waiverStatement],['terms',termsAndConditions]]){
   assert.equal(node(key+'-question').hidden,!text.trim());assert.equal(field(key+'Accepted').required,!!text.trim());assert.equal(field(key+'Accepted').disabled,!text.trim());assert.equal(field(key+'Accepted').checked,false);
  }
  const hasConsent=!!(waiverStatement.trim()||termsAndConditions.trim());
  assert.equal(field('printedWaiverAccepted').required,!!waiverStatement.trim());
  assert.equal(field('printedWaiverAccepted').disabled,!waiverStatement.trim());
  assert.equal(field('printedWaiverAccepted').checked,false);
  node('next').onclick();node('next').onclick();
  assert.equal(sections[hasConsent?2:3].hidden,false);
  assert.equal(node('progress').textContent,hasConsent?'Step 3 of 4':'Step 3 of 3');
  if(hasConsent){node('next').onclick();assert.equal(sections[2].hidden,false);field('waiverAccepted').checked=true;field('termsAccepted').checked=true;if(waiverStatement.trim()){node('next').onclick();assert.equal(sections[2].hidden,false);}field('printedWaiverAccepted').checked=true;node('next').onclick();assert.equal(sections[3].hidden,false);}
  node('back').onclick();assert.equal(sections[hasConsent?2:1].hidden,false);
  assert.equal(field('privacyAccepted').required,true);
 }
});

test('printed waiver agreement is separate from waiver acceptance and starts unchecked',()=>{
 const html=readPublic('test-drive-registration.html');
 assert.match(html,/<input type="checkbox" name="printedWaiverAccepted" required> I agree to sign a printed copy of this waiver\./);
 assert.doesNotMatch(html,/name="printedWaiverAccepted"[^>]*\bchecked\b/);
});
