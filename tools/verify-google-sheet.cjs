'use strict';
// Read-only credential/destination check. Never prints keys, JWTs or tokens.
const fs = require('node:fs');
const crypto = require('node:crypto');

async function main() {
  const [keyFile, sheetUrl] = process.argv.slice(2);
  if (!keyFile || !sheetUrl) throw new Error('Usage: node tools/verify-google-sheet.cjs <key-file> <sheet-url>');
  const credentials = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) throw new Error('File is not a service-account JSON key.');
  const url = new URL(sheetUrl);
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (url.origin !== 'https://docs.google.com' || !match) throw new Error('Invalid Google Sheets URL.');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })}`;
  const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!tokenResponse.ok) throw new Error(`Google authentication failed (HTTP ${tokenResponse.status}).`);
  const token = (await tokenResponse.json()).access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const root = `https://sheets.googleapis.com/v4/spreadsheets/${match[1]}`;
  const response = await fetch(`${root}?fields=spreadsheetId,properties.title,sheets.properties`, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Spreadsheet access failed (HTTP ${response.status}). Check API enablement and sharing.`);
  const metadata = await response.json();
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') || url.searchParams.get('gid');
  const selected = metadata.sheets.find(sheet => gid !== null ? String(sheet.properties.sheetId) === gid : sheet.properties.title === 'TDQ REGISTRATION');
  if (!selected) throw new Error('The selected spreadsheet tab was not found.');
  const range = `'${selected.properties.title.replace(/'/g, "''")}'!A1:K1`;
  const firstRowResponse = await fetch(`${root}/values/${encodeURIComponent(range)}`, { headers, signal: AbortSignal.timeout(20000) });
  if (!firstRowResponse.ok) throw new Error(`Could not inspect the tracking header (HTTP ${firstRowResponse.status}).`);
  const firstRow = (await firstRowResponse.json()).values || [];
  console.log(JSON.stringify({ authenticated: true, serviceAccount: credentials.client_email,
    project: credentials.project_id, spreadsheet: metadata.properties.title, tab: selected.properties.title,
    emptyFirstRow: firstRow.length === 0, tdqsysHeader: firstRow[0]?.[0] === 'Registration ID', readOnlyCheck: true }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
