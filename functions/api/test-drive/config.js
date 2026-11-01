const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json' };
const validId = (value) => /^[0-9a-f-]{1,64}$/i.test((value || '').trim());

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (context.request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!validId(id)) return new Response(JSON.stringify({ error: 'Invalid registration location.' }), { status: 400, headers });
  const key = context.env.SUPABASE_SECRET_KEY || context.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !context.env.SUPABASE_URL) return new Response(JSON.stringify({ error: 'Registration is temporarily unavailable.' }), { status: 503, headers });
  try {
    const response = await fetch(`${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/tdqsys_public_registration_config`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_instance_id: id.trim().toLowerCase() })
    });
    if (!response.ok) throw new Error('upstream');
    return new Response(await response.text(), { headers });
  } catch { return new Response(JSON.stringify({ error: 'Registration is temporarily unavailable.' }), { status: 503, headers }); }
}
