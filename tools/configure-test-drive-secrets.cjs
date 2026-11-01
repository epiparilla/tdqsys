'use strict';
// Deployment helper. Credentials stay in process memory or ignored runtime
// files; subprocess output and tokens are deliberately never printed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const REF = 'pnyptdyfkftrcgjlaqnr';
const ACCOUNT = 'e7e14bed97bb8f5583530bb47ebfb8e7';

async function main() {
  const [keyFile, supabaseExe, environment = 'preview'] = process.argv.slice(2);
  if (!keyFile || !supabaseExe) throw new Error('Provide the local Google JSON key path and Supabase executable path.');
  if (!['preview', 'production'].includes(environment)) throw new Error('Select preview or production.');
  const credentials = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (credentials.type !== 'service_account' || !credentials.private_key) throw new Error('Invalid Google service account file.');
  const compact = JSON.stringify(credentials);
  if (compact.includes("'")) throw new Error('Unsupported quote in credential file.');
  const runtime = path.join(__dirname, '..', '.dev-db');
  fs.mkdirSync(runtime, { recursive: true });
  const keyPath = path.join(runtime, 'test-drive-code-key.txt');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  const codeKey = fs.readFileSync(keyPath, 'utf8').trim();
  if (Buffer.from(codeKey, 'base64').length !== 32) throw new Error('Invalid cached code-encryption key.');
  const environmentPath = path.join(runtime, 'test-drive-secrets.env');
  try {
    fs.writeFileSync(environmentPath, `GOOGLE_SERVICE_ACCOUNT_JSON='${compact}'\nTEST_DRIVE_CODE_ENCRYPTION_KEY=${codeKey}\n`, { mode: 0o600 });
    const result = spawnSync(supabaseExe, ['secrets', 'set', '--project-ref', REF, '--env-file', environmentPath], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('Supabase secret configuration failed. No credentials have been printed.');
    console.log('Supabase Google credential and code-encryption secret configured.');
  } finally { if (fs.existsSync(environmentPath)) fs.unlinkSync(environmentPath); }

  const keyResult = spawnSync(supabaseExe, ['projects', 'api-keys', '--project-ref', REF, '--output', 'json'], { encoding: 'utf8', windowsHide: true });
  if (keyResult.status !== 0) throw new Error('Could not retrieve the server API key for preview configuration.');
  const apiKeys = JSON.parse(keyResult.stdout);
  const serviceKey = apiKeys.find(item => item.name === 'service_role')?.api_key;
  if (!serviceKey) throw new Error('Server API key not found.');

  const configFiles = [
    path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    path.join(process.env.USERPROFILE || '', '.wrangler', 'config', 'default.toml')
  ];
  let token;
  for (const config of configFiles) {
    if (!fs.existsSync(config)) continue;
    const candidate = fs.readFileSync(config, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
    if (!candidate) continue;
    const check = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/tdqsys`, { headers: { Authorization: `Bearer ${candidate}` }, signal: AbortSignal.timeout(20000) });
    if (check.ok) { token = candidate; break; }
  }
  if (!token) throw new Error('No working Cloudflare login was found for preview configuration.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/tdqsys`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ deployment_configs: { [environment]: { env_vars: {
      SUPABASE_URL: { type: 'plain_text', value: `https://${REF}.supabase.co` },
      SUPABASE_SECRET_KEY: { type: 'secret_text', value: serviceKey },
      TEST_DRIVE_CODE_ENCRYPTION_KEY: { type: 'secret_text', value: codeKey }
    } } } })
  });
  if (!response.ok || !(await response.json()).success) throw new Error('Cloudflare preview-secret configuration failed.');
  console.log(`Cloudflare ${environment} secrets configured.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
