import { validateSeCheckin } from "../../../shared/test-drive.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

function operatingDay(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function expiryAtMidnight(timeZone) {
  // The database re-checks operating day. This expiry is an unambiguous UTC
  // instant for the selected dealership timezone.
  const today = operatingDay(timeZone);
  const start = new Date(`${today}T00:00:00Z`);
  const probe = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(start).find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const match = probe.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 0;
  return new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1) - offset * 60000).toISOString();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function encryptCode(code, secret) {
  const raw = Uint8Array.from(atob(secret), (ch) => ch.charCodeAt(0));
  if (raw.byteLength !== 32) throw new Error('TEST_DRIVE_CODE_ENCRYPTION_KEY must be a base64 32-byte key');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(code));
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv); combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (context.request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const body = await context.request.json();
    const checked = validateSeCheckin(body);
    if (!checked.ok) return json({ error: 'Validation failed', fields: checked.errors }, 400);
    const serviceKey = context.env.SUPABASE_SECRET_KEY || context.env.SUPABASE_SERVICE_ROLE_KEY;
    const codeKey = context.env.TEST_DRIVE_CODE_ENCRYPTION_KEY;
    if (!context.env.SUPABASE_URL || !serviceKey || !codeKey) return json({ error: 'Registration is temporarily unavailable.' }, 503);
    const instanceId = body.instanceId.trim().toLowerCase();
    const settingResponse = await fetch(`${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/test_drive_settings?instance_id=eq.${encodeURIComponent(instanceId)}&select=timezone`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!settingResponse.ok) return json({ error: 'Registration is temporarily unavailable.' }, 503);
    const settings = await settingResponse.json();
    if (!settings.length) return json({ error: 'Registration has not been configured for this location.' }, 404);
    const zone = settings[0].timezone;
    const day = operatingDay(zone);
    const rpc = `${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/tdqsys_register_se_checkin`;
    for (let tries = 0; tries < 30; tries += 1) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_instance_id: body.instanceId.trim().toLowerCase(), p_name: checked.value.name,
          p_dealership: checked.value.dealership, p_operating_day: day,
          p_code_hash: await sha256(code), p_code_ciphertext: await encryptCode(code, codeKey),
          p_expires_at: expiryAtMidnight(zone)
        })
      });
      if (response.ok) return json({ code, message: 'Collect your printed code at the registration booth.' }, 201);
      const error = await response.json().catch(() => ({}));
      // Unique-code collisions are expected at random; all other failures are not.
      if (error.code !== '23505') return json({ error: 'Registration could not be completed.' }, 400);
      if (String(error.message || '').includes('sales_executive_id_operating_day')) return json({ error: 'You are already registered today. Please collect your code from the facilitator.' }, 409);
    }
    return json({ error: 'No unique code is currently available. Please try again.' }, 503);
  } catch (error) {
    return json({ error: 'Registration could not be completed.' }, 400);
  }
}
