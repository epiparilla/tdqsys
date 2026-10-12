// Supabase Edge Function: direct, authenticated desktop-to-cloud queue sync.
// Deploy with JWT verification disabled: this endpoint authorises a per-
// installation writer token, not a browser user session.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-tdqsys-instance,x-tdqsys-writer' };
const validId = (v: string) => /^[0-9a-f-]{1,64}$/i.test(v);
const hash = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  const instanceId = (req.headers.get('x-tdqsys-instance') || '').trim().toLowerCase();
  const writer = (req.headers.get('x-tdqsys-writer') || '').trim();
  if (!validId(instanceId) || !/^[0-9a-f-]{36}$/i.test(writer)) return new Response('Unauthorised', { status: 401, headers: cors });
  try {
    const state = await req.json();
    if (!state || !state.config || !state.queues) throw new Error('invalid state');
    if (state.config.instanceId !== instanceId) throw new Error('instance mismatch');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Remote revocation gate: instances listed in revoked_licenses are refused with 403
    const { data: revoked, error: revokedError } = await admin
      .from('revoked_licenses').select('instance_id, reason').eq('instance_id', instanceId).maybeSingle();
    if (!revokedError && revoked) {
      return new Response(JSON.stringify({
        error: 'license_revoked',
        reason: revoked.reason || 'This licence was remotely revoked by the administrator.'
      }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const tokenHash = await hash(writer);
    const { data: known, error: lookupError } = await admin
      .from('tdqsys_queue_writers').select('token_hash').eq('instance_id', instanceId).maybeSingle();
    if (lookupError) throw lookupError;
    if (known && known.token_hash !== tokenHash) return new Response('Unauthorised', { status: 401, headers: cors });
    if (!known) {
      const { error } = await admin.from('tdqsys_queue_writers').insert({ instance_id: instanceId, token_hash: tokenHash });
      if (error) return new Response('Unauthorised', { status: 401, headers: cors });
    }
    const { error } = await admin.from('queue_state').upsert({ instance_id: instanceId, state, updated_at: new Date().toISOString() }, { onConflict: 'instance_id' });
    if (error) throw error;
    return Response.json({ success: true }, { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any)?.message || String(err) }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
