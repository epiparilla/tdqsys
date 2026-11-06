'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../functions/_middleware.js'), 'utf8').replace('export async function', 'async function');
const sandbox = { URL, Response, decodeURIComponent };
vm.createContext(sandbox); vm.runInContext(source, sandbox);

test('Pages blocks desktop setup/control routes before serving their files', async () => {
    for (const route of ['/settings', '/settings.html', '/settings/', '/settings%22', '/s%65ttings.html', '/settings.html/', '/dashboard', '/dashboard.html', '/dashboard-brand2.html','/sales-executives.html','/giveaways.html','/giveaways.js','/live-dashboard.html','/live-dashboard.js','/giveaway-stock-settings.js','/history-cleanup-ui.js','/event-setup.html', '/master-table.html', '/print-queue.html', '/facilitator-shell.js', '/test-drive-operations.html', '/test-drive-operations.js']) {
        let called = false;
        const response = await sandbox.onRequest({ request: { url: `https://tdqsys.pages.dev${route}` }, next() { called = true; return new Response('unexpected public page'); } });
        assert.equal(response.status, 404, route);
        assert.equal(called, false, route);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
});

test('Pages still serves registration forms, queue displays, and existing update metadata', async () => {
    for (const route of ['/se-registration.html', '/test-drive-registration.html', '/client.html', '/display_with_ads.html', '/api/test-drive/config', '/api/data', '/version.json', '/download']) {
        const response = await sandbox.onRequest({ request: { url: `https://tdqsys.pages.dev${route}` }, next: async () => new Response('public response') });
        assert.equal(await response.text(), 'public response', route);
    }
});
