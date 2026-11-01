// Private desktop bridge for test-drive operations. Browser forms never call
// this function: the installed TDQSYS app supplies its per-location writer
// token, matching the existing queue-sync trust boundary.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncOneRegistration, googleToken, verifySheetConnection } from '../_shared/google-sheets.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-tdqsys-instance,x-tdqsys-writer' };
const validId = (v: string) => /^[0-9a-f-]{1,64}$/i.test(v);
const hash = async (v: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))].map(x => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  const instanceId = (req.headers.get('x-tdqsys-instance') || '').trim().toLowerCase();
  const writer = (req.headers.get('x-tdqsys-writer') || '').trim();
  if (!validId(instanceId) || !/^[0-9a-f-]{36}$/i.test(writer)) return new Response('Unauthorised', { status: 401, headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: known, error: writerError } = await admin.from('tdqsys_queue_writers').select('token_hash').eq('instance_id', instanceId).maybeSingle();
    if (writerError) throw writerError;
    if (!known || known.token_hash !== await hash(writer)) return new Response('Unauthorised', { status: 401, headers: cors });
    const body = await req.json();
    const { data: revoked, error: revocationError } = await admin.from('revoked_licenses').select('instance_id').eq('instance_id', instanceId).maybeSingle();
    if (revocationError) throw revocationError;
    if (revoked) return Response.json({ error: 'license_revoked' }, { status: 403, headers: cors });
    if (['integration-info', 'test-sheets'].includes(body.action)) {
      const secret = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
      if (!secret) return Response.json({ configured: false, error: 'Google Sheets service has not been connected by the system administrator.' }, { status: body.action === 'test-sheets' ? 503 : 200, headers: cors });
      const credentials = JSON.parse(secret);
      if (body.action === 'integration-info') {
        return Response.json({ configured: true, serviceAccountEmail: credentials.client_email }, { headers: cors });
      }
      const destination = await verifySheetConnection(String(body.sheetsUrl || ''), await googleToken(credentials));
      return Response.json({ connected: true, ...destination }, { headers: cors });
    }
    if (body.action === 'sync-sheets') {
      const result = await syncOneRegistration(admin, instanceId, Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'));
      return Response.json(result, { headers: cors });
    }
    if (body.action === 'claim-print' && body.jobId) {
      const { data: label, error } = await admin.rpc('tdqsys_claim_print_job', { p_instance_id: instanceId, p_job_id: body.jobId });
      if (error) throw error;
      if (label.kind === 'se_code_slip') {
        const secret = Deno.env.get('TEST_DRIVE_CODE_ENCRYPTION_KEY');
        if (!secret) throw new Error('SE code printing requires the server encryption key.');
        const bytes = Uint8Array.from(atob(label.ciphertext), ch => ch.charCodeAt(0));
        const raw = Uint8Array.from(atob(secret), ch => ch.charCodeAt(0));
        const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
        label.value = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0,12) }, key, bytes.slice(12)));
        delete label.ciphertext;
      }
      return Response.json({ label }, { headers: cors });
    }
    if (body.action === 'print-result' && body.jobId && ['printed','failed','handed_over'].includes(body.status)) {
      const { data, error } = await admin.from('print_jobs').update({ status: body.status,
        ...(body.status === 'printed' ? { printed_at: new Date().toISOString() } : {}),
        ...(body.status === 'handed_over' ? { handed_over_at: new Date().toISOString() } : {}),
        last_error: body.status === 'failed' ? String(body.error || 'Printer did not accept the job.').slice(0,500) : null,
        updated_at: new Date().toISOString() }).eq('instance_id', instanceId).eq('id', body.jobId)
        .eq('status', body.status === 'handed_over' ? 'printed' : 'claimed').select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Print job state changed. Refresh the queue.');
      return Response.json({ saved: true }, { headers: cors });
    }
    if (body.action === 'configure') {
      const { error } = await admin.rpc('tdqsys_configure_test_drive', {
        p_instance_id: instanceId, p_models: body.models, p_waiver: body.waiver, p_terms: body.terms, p_sheets_url: body.sheetsUrl || ''
      });
      if (error) throw error;
      return Response.json({ configured: true }, { headers: cors });
    }
    if (body.action === 'snapshot') {
      const { error: ensureError } = await admin.rpc('tdqsys_ensure_daily_run', { p_instance_id: instanceId });
      if (ensureError) throw ensureError;
      const { data: run, error: runError } = await admin.from('queue_runs').select('*').eq('instance_id', instanceId).eq('status', 'active').maybeSingle();
      if (runError) throw runError;
      const { data: models, error: modelError } = await admin.from('vehicle_models').select('*').eq('instance_id', instanceId).eq('active', true).order('full_name');
      if (modelError) throw modelError;
      if (!run) return Response.json({ run: null, models, entries: [], printJobs: [] }, { headers: cors });
      const { data: entries, error: entryError } = await admin.from('test_drive_entries')
        .select('*,registrations(full_name,email,city_address,contact_number)')
        .eq('instance_id', instanceId).eq('queue_run_id', run.id).order('queue_number');
      if (entryError) throw entryError;
      const { data: printJobs, error: printError } = await admin.from('print_jobs').select('*,se_daily_checkins(expires_at,sales_executives(name))')
        .eq('instance_id', instanceId).in('status', ['pending', 'claimed', 'failed']).order('created_at');
      if (printError) throw printError;
      const activeIds = new Set((entries || []).map(e => e.id));
      let earlierEntries = [];
      if (body.history === true) {
        const { data: earlierRuns, error } = await admin.from('queue_runs').select('id').eq('instance_id', instanceId).eq('operating_day', run.operating_day).eq('status','closed');
        if (error) throw error;
        if (earlierRuns?.length) {
          const { data, error: historyError } = await admin.from('test_drive_entries').select('*,registrations(full_name,email,city_address,contact_number),vehicle_models(full_name)')
            .eq('instance_id', instanceId).in('queue_run_id',earlierRuns.map(r => r.id)).order('issued_at');
          if (historyError) throw historyError;
          earlierEntries = data || [];
        }
      }
      const { data: display, error: displayError } = await admin.from('display_state').select('*').eq('instance_id', instanceId).maybeSingle();
      if (displayError) throw displayError;
      return Response.json({ run, models, entries, earlierEntries, display, printJobs: (printJobs || []).filter(j =>
        j.kind === 'se_code_slip' ? new Date(j.se_daily_checkins?.expires_at || 0).getTime() > Date.now() : activeIds.has(j.test_drive_entry_id)) }, { headers: cors });
    }
    // An authenticated location must never act on another location's UUID.
    if (body.entryId) {
      const { data: owned, error } = await admin.from('test_drive_entries').select('id').eq('id', body.entryId).eq('instance_id', instanceId).maybeSingle();
      if (error) throw error;
      if (!owned) return Response.json({ error: 'Entry not found' }, { status: 404, headers: cors });
    }
    if (body.action === 'status' && body.entryId && ['done', 'no_show', 'cancelled'].includes(body.status)) {
      const { data, error } = await admin.rpc('tdqsys_mark_entry', { p_instance_id: instanceId, p_entry_id: body.entryId, p_status: body.status });
      if (error) throw error;
      return Response.json({ entry: data }, { headers: cors });
    }
    if (body.action === 'callback' && body.entryId) {
      const { data, error } = await admin.from('test_drive_entries').select('queue_number,vehicle_models(full_name),queue_runs(status)')
        .eq('id',body.entryId).eq('instance_id',instanceId).single();
      if (error) throw error;
      if (data.queue_runs.status !== 'active') throw new Error('This ticket belongs to an earlier run.');
      return Response.json({ ticket: data.queue_number, modelName: data.vehicle_models.full_name }, { headers: cors });
    }
    if (body.action === 'reissue' && body.entryId) {
      const { data, error } = await admin.rpc('tdqsys_reissue_ticket', { p_instance_id: instanceId, p_entry_id: body.entryId, p_model_id: body.modelId || null, p_cancel_source: body.cancelSource === true });
      if (error) throw error;
      return Response.json(data, { headers: cors });
    }
    if (body.action === 'ongoing' && body.entryId) {
      const { data, error } = await admin.rpc('tdqsys_set_ongoing', { p_entry_id: body.entryId, p_actor_id: 'desktop' });
      if (error) throw error;
      const entry = Array.isArray(data) ? data[0] : data;
      const { data: model, error: modelError } = await admin.from('vehicle_models').select('brand_key,unit_index').eq('id', entry.vehicle_model_id).eq('instance_id', instanceId).single();
      if (modelError) throw modelError;
      return Response.json({ entry, model }, { headers: cors });
    }
    if (body.action === 'reset' && body.reason) {
      const { data: settings, error: settingsError } = await admin.from('test_drive_settings').select('timezone').eq('instance_id', instanceId).single();
      if (settingsError) throw settingsError;
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const day = ['year','month','day'].map(type => parts.find(p => p.type === type)!.value).join('-');
      const { data, error } = await admin.rpc('tdqsys_open_queue_run', { p_instance_id: instanceId, p_operating_day: day, p_reset_reason: body.reason, p_opened_by: 'desktop' });
      if (error) throw error;
      return Response.json({ run: data }, { headers: cors });
    }
    return new Response('Bad Request', { status: 400, headers: cors });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400, headers: cors }); }
});
