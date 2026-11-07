import { validInstanceId, validSeCode } from '../../../shared/test-drive.js';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function onRequest(context) {
  if (context.request.method !== 'POST') return reply({ error: 'Method Not Allowed' }, 405);
  try {
    const body = await context.request.json();
    if (!body || !validInstanceId(body.instanceId) || !validSeCode(body.code)) return reply({ error: 'Enter a valid four-digit Agent code.' }, 400);
    const key = context.env.SUPABASE_SECRET_KEY || context.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !context.env.SUPABASE_URL) return reply({ error: 'Registration is temporarily unavailable.' }, 503);
    const instance = body.instanceId.trim().toLowerCase();
    const clientKey = await hash(`${instance}:${context.request.headers.get('CF-Connecting-IP') || 'unknown'}`);
    const response = await fetch(`${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/tdqsys_validate_se_code`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_instance_id: instance, p_code_hash: await hash(body.code.trim()), p_client_key: clientKey })
    });
    if (!response.ok) return reply({ error: 'Code validation is temporarily unavailable.' }, 503);
    const result = await response.json();
    return reply(result, result.limited ? 429 : result.error ? 400 : 200);
  } catch { return reply({ error: 'Code validation could not be completed.' }, 400); }
}
