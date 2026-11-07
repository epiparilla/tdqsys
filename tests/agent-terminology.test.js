'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('v2 public UI and validation use generic Agent wording without legacy abbreviations',()=>{
 for(const file of ['facilitator-shell.js','giveaways.html','sales-executives.html','se-registration.html','settings.html','test-drive-registration.html','test-drive-operations.js']) {
  const text=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
  assert.doesNotMatch(text,/Sales Executives?|Sales Exec\b|\bSEs?\b/,file);
 }
 assert.match(fs.readFileSync(path.join(__dirname,'../public/facilitator-shell.js'),'utf8'),/>Agents<\/a>/);
 assert.match(fs.readFileSync(path.join(__dirname,'../public/se-registration.html'),'utf8'),/Agent Registration/);
 assert.match(require('../shared/test-drive').validateRegistration({}).errors.seCode,/Agent code/);
});
test('legacy route, payload and database identifiers remain compatible',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/test-drive-registration.html'),'utf8');
 assert.match(source,/name="seCode"/);
 const nav=fs.readFileSync(path.join(__dirname,'../public/facilitator-shell.js'),'utf8');
 assert.match(nav,/href="sales-executives.html"/);
 const db=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611080001_agent_ui_wording.sql'),'utf8');
 assert.doesNotMatch(db,/alter table|rename|update public\./i);
});
