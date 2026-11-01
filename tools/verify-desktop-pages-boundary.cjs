'use strict';
const assert = require('node:assert/strict');
(async () => {
  const base = process.argv[2] || 'https://test-drive-preview.tdqsys.pages.dev';
  for (const route of ['/settings','/settings.html','/settings%22','/dashboard.html','/dashboard-brand2.html','/sales-executives.html','/event-setup.html','/master-table.html','/print-queue.html','/facilitator-shell.js','/test-drive-operations.html','/test-drive-operations.js']) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status,404,route);
    console.log(`PASS online desktop route blocked: ${route}`);
  }
  for (const route of ['/se-registration.html','/test-drive-registration.html','/client.html','/display_with_ads.html','/version.json']) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status,200,route);
    console.log(`PASS public route available: ${route}`);
  }
  const root = await fetch(base + '/', { signal: AbortSignal.timeout(20000) });
  const html = await root.text();
  assert.equal(/<a\b[^>]*href=["'](?:settings|dashboard|test-drive-operations)(?:\.html)?["']/i.test(html),false);
  console.log('PASS online hub contains no desktop setup/control links.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
