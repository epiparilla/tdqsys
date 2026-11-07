'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=file=>fs.readFileSync(require('node:path').join(__dirname,'../public',file),'utf8');
test('compact frozen layout is loaded before paint on every staff page, not public forms or displays',()=>{
 for(const page of ['dashboard.html','dashboard-brand2.html','master-table.html','print-queue.html','sales-executives.html','giveaways.html','live-dashboard.html','event-setup.html','settings.html']) {
  const html=read(page);assert.match(html.split('</head>')[0],/href="desktop-layout.css"/);assert.match(html,/src="desktop-layout.js" defer/);
 }
 for(const page of ['test-drive-registration.html','se-registration.html','display_with_ads.html','client.html'])assert.doesNotMatch(read(page),/desktop-layout/);
});
test('staff chrome and controls stay outside the independently scrolling rows',()=>{
 const shell=read('facilitator-shell.js'),js=read('desktop-layout.js'),css=read('desktop-layout.css');
 assert.match(shell,/<div class="desktop-top"><header/);
 assert.ok(shell.indexOf('</div><section id="event-setup"')>shell.indexOf('<p id="run"'));
 assert.match(js,/while \(panel.firstChild !== table\) toolbar.append\(panel.firstChild\)/);
 assert.match(js,/ResizeObserver/);
 assert.match(css,/\.desktop-top\{position:sticky;top:0/);
 assert.match(css,/thead th[^}]*position:sticky;top:0/);
 assert.match(css,/\.desktop-table-panel > \.table-scroll\{flex:1;min-height:60px;overflow:auto/);
 assert.match(css,/\.desktop-table-page\{height:100dvh;overflow:hidden/);
 assert.doesNotMatch(css,/#board\{[^}]*overflow-x:hidden/);
});
test('frozen chrome has an opaque full-bleed backing over the page gutters',()=>{
 const css=read('desktop-layout.css');
 assert.match(css,/\.desktop-top\{isolation:isolate\}/);
 assert.match(css,/\.desktop-top::before\{content:"";position:absolute;inset:-12px -14px 2px;background:#000;z-index:-1;pointer-events:none\}/);
});
