// Private desktop bridge for test-drive operations. Browser forms never call
// this function: the installed TDQSYS app supplies its per-location writer
// token, matching the existing queue-sync trust boundary.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-tdqsys-instance,x-tdqsys-writer' };
const validId = (v: string) => /^[0-9a-f-]{1,64}$/i.test(v);
const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map(x => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const instanceId = (req.headers.get('x-tdqsys-instance') || '').trim().toLowerCase();
  const writer = (req.headers.get('x-tdqsys-writer') || '').trim();
  if (!validId(instanceId) || !/^[0-9a-f-]{36}$/i.test(writer)) return new Response('Unauthorised', { status: 401, headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: known } = await admin.from('tdqsys_queue_writers').select('token_hash').eq('instance_id', instanceId).maybeSingle();
  if (!known || known.token_hash !== await hash(writer)) return new Response('Unauthorised', { status: 401, headers: cors });
  try {
    const body = req.method === 'GET' ? {} : await req.json();
    if (body.action === 'ongoing' && body.entryId) {
      const { data, error } = await admin.rpc('tdqsys_set_ongoing', { p_entry_id: body.entryId, p_actor_id: 'desktop' });
      if (error) throw error;
      return Response.json({ entry: data }, { headers: cors });
    }
    if (body.action === 'reset' && body.operatingDay && body.reason) {
      const { data, error } = await admin.rpc('tdqsys_open_queue_run', { p_instance_id: instanceId, p_operating_day: body.operatingDay, p_reset_reason: body.reason, p_opened_by: 'desktop' });
      if (error) throw error;
      return Response.json({ run: data }, { headers: cors });
    }
    return new Response('Bad Request', { status: 400, headers: cors });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400, headers: cors }); }
});
