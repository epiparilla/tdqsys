import { validateRegistration } from '../../../shared/test-drive.js';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const optionalBoolean = value => value === 'Yes' ? true : value === 'No' ? false : null;

export async function onRequest(context) {
  if (context.request.method !== 'POST') return reply({ error: 'Method Not Allowed' }, 405);
  try {
    const body = await context.request.json();
    const checked = validateRegistration(body, { waiverRequired:false, termsRequired:false });
    if (!checked.ok) return reply({ error: 'Please check the required fields.', fields: checked.errors }, 400);
    if(body.simulationRunId!==undefined && (typeof body.simulationRunId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.simulationRunId) || !checked.value.fullName.startsWith('TEST ')))return reply({error:'Invalid simulation registration.'},400);
    const idempotencyKey = context.request.headers.get('Idempotency-Key');
    if (!idempotencyKey || !/^[a-z0-9-]{8,200}$/i.test(idempotencyKey)) return reply({ error: 'Invalid submission identifier. Please refresh the form.' }, 400);
    if (!/^[a-f0-9]{64}$/.test(body.waiverVersion || '') || !/^[a-f0-9]{64}$/.test(body.termsVersion || '')) return reply({ error: 'Please reload and review the current waiver and Terms.' }, 400);
    const key = context.env.SUPABASE_SECRET_KEY || context.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !context.env.SUPABASE_URL) return reply({ error: 'Registration is temporarily unavailable.' }, 503);
    const instance = body.instanceId.trim().toLowerCase();
    const codeHash = await hash(checked.value.seCode);
    const rpc = async (name, args) => {
      const response = await fetch(`${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
      });
      return { response, result: await response.json() };
    };
    const validation = await rpc('tdqsys_validate_se_code', { p_instance_id: instance, p_code_hash: codeHash,
      p_client_key: await hash(`${instance}:${context.request.headers.get('CF-Connecting-IP') || 'unknown'}`) });
    if (!validation.response.ok) return reply({ error: 'Registration is temporarily unavailable.' }, 503);
    if (validation.result.error) return reply({ error: validation.result.error }, validation.result.limited ? 429 : 400);
    if (body.waiverAccepted !== true || body.termsAccepted !== true) {
      // Only server-loaded location text can make a consent optional.
      const current = await rpc('tdqsys_public_registration_config', { p_instance_id:instance });
      if (!current.response.ok || typeof current.result.waiverStatement !== 'string' || typeof current.result.termsAndConditions !== 'string') return reply({ error:'Registration is temporarily unavailable.' },503);
      const consent = validateRegistration(body, { waiverRequired:!!current.result.waiverStatement.trim(), termsRequired:!!current.result.termsAndConditions.trim() });
      if (!consent.ok) return reply({ error:'Please check the required fields.', fields:consent.errors },400);
    }
    const args = {
      p_instance_id: instance, p_full_name: checked.value.fullName, p_name_search: checked.value.nameSearch,
      p_email: checked.value.email, p_city_address: checked.value.cityAddress, p_contact_number: checked.value.contactNumber,
      p_for_application: optionalBoolean(body.forApplication), p_for_reservation: optionalBoolean(body.forReservation),
      p_code_hash: codeHash, p_waiver_version: body.waiverVersion, p_terms_version: body.termsVersion,
      p_idempotency_key: idempotencyKey, p_model_ids: checked.value.modelIds
    };
    const {response,result}=await rpc(body.simulationRunId?'tdqsys_simulation_registration':'tdqsys_submit_registration',body.simulationRunId?{p_instance_id:instance,p_run_id:body.simulationRunId,p_kind:'client',p_data:args}:args);
    if (!response.ok) return reply({ error: result.message?.includes('consent text changed') ? 'The waiver or Terms changed. Please reload and review them.' : 'Registration could not be completed. Please see the facilitator.' }, 400);
    return reply({ ...result, message: 'Registration received—please collect your printed queue number from the facilitator.' }, 201);
  } catch { return reply({ error: 'Registration could not be completed. Please retry.' }, 400); }
}
