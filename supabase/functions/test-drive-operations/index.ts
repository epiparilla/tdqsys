// Private desktop bridge for test-drive operations. Browser forms never call
// this function: the installed TDQSYS app supplies its per-location writer
// token, matching the existing queue-sync trust boundary.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncOneRegistration, googleToken, verifySheetConnection } from '../_shared/google-sheets.js';
import { decryptSeCode } from '../_shared/se-codes.js';

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
    if(body.action==='simulation-open') {
      if(body.confirm!==true)return Response.json({error:'Confirm a test run first.'},{status:400,headers:cors});
      const {data,error}=await admin.rpc('tdqsys_open_simulation_run',{p_instance_id:instanceId});
      if(error)return Response.json({error:error.message},{status:error.code==='P0001'?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if(body.action==='sync-local-operation') {
      const {data,error}=await admin.rpc('tdqsys_apply_local_operation',{p_instance_id:instanceId,p_operation:body.operation});
      if(error)return Response.json({error:error.message},{status:['P0001','22P02','23505'].includes(error.code)?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if (['integration-info', 'test-sheets'].includes(body.action)) {
      const secret = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
      if (!secret) return Response.json({ configured: false, error: 'Google Sheets service has not been connected by the system administrator.' }, { status: body.action === 'test-sheets' ? 503 : 200, headers: cors });
      const credentials = JSON.parse(secret);
      if (body.action === 'integration-info') {
        return Response.json({ configured: true, serviceAccountEmail: credentials.client_email }, { headers: cors });
      }
      const { data: locationSettings, error: settingsError } = await admin.from('test_drive_settings').select('timezone').eq('instance_id',instanceId).maybeSingle();
      if (settingsError) throw settingsError;
      const destination = await verifySheetConnection(String(body.sheetsUrl || ''), await googleToken(credentials), {timeZone:locationSettings?.timezone || 'Asia/Manila'});
      return Response.json({ connected: true, ...destination }, { headers: cors });
    }
    if (body.action === 'sync-sheets') {
      const result = await syncOneRegistration(admin, instanceId, Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'));
      return Response.json(result, { headers: cors });
    }
    if(['giveaway-correct','giveaway-correction-history'].includes(body.action)) {
      const id=value=>typeof value==='string' && /^[0-9a-f-]{36}$/i.test(value);
      if(!id(body.runId) || !['claims','opening'].includes(body.kind) || typeof body.target!=='string' || !body.target.trim() || body.target.length>160 || (body.kind==='claims' && !id(body.target)))return Response.json({error:'Invalid correction target.'},{status:400,headers:cors});
      const write=body.action==='giveaway-correct';
      const items=value=>Array.isArray(value) && value.length<=200 && value.every(item=>typeof item==='string' && item.trim() && item.length<=160) && new Set(value.map(item=>item.trim().toLowerCase())).size===value.length;
      const quantity=value=>Number.isInteger(value) && value>=0 && value<=100000000;
      if(write && (body.confirm!==true || !id(body.requestId) || typeof body.reason!=='string' || body.reason.trim().length<3 || body.reason.length>500 || typeof body.operator!=='string' || !body.operator.trim() || body.operator.length>120 || !(body.kind==='claims'?items(body.expected)&&items(body.value):quantity(body.expected)&&quantity(body.value))))return Response.json({error:'Review the correction, enter your name and reason, then confirm.'},{status:400,headers:cors});
      const {data,error}=await admin.rpc(write?'tdqsys_correct_giveaway':'tdqsys_giveaway_correction_history',write?{
        p_instance_id:instanceId,p_kind:body.kind,p_target:body.target,p_expected:body.expected,p_value:body.value,p_reason:body.reason.trim(),p_operator:body.operator.trim(),p_request_id:body.requestId,p_expected_run:body.runId
      }:{p_instance_id:instanceId,p_run_id:body.runId,p_kind:body.kind,p_target:body.target});
      if(error)return Response.json({error:error.message},{status:error.code==='P0001'?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if(body.action==='issue-giveaways') {
      if(typeof body.runId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.runId) || typeof body.registrationId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.registrationId) || typeof body.requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)
        || !Array.isArray(body.items) || body.items.length<1 || body.items.length>200 || body.items.some(item=>typeof item!=='string' || !item.trim() || item.length>160)
        || new Set(body.items.map(item=>item.trim().toLowerCase())).size!==body.items.length) {
        return Response.json({error:'Select distinct giveaway items.'},{status:400,headers:cors});
      }
      const {data,error}=await admin.rpc('tdqsys_issue_giveaways',{p_instance_id:instanceId,p_registration_id:body.registrationId,p_items:body.items,p_request_id:body.requestId,p_expected_run:body.runId});
      if(error)return Response.json({error:error.message},{status:error.code==='P0001'?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if (body.action === 'giveaway-snapshot' || body.action === 'set-giveaway') {
      const snapshot = body.action === 'giveaway-snapshot';
      if(snapshot){const {error}=await admin.rpc('tdqsys_ensure_daily_run',{p_instance_id:instanceId});if(error)throw error;}
      if (!snapshot && (typeof body.registrationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.registrationId)
        || (body.item !== null && (typeof body.item !== 'string' || body.item.length > 160))
        || (body.expectedItem !== null && (typeof body.expectedItem !== 'string' || body.expectedItem.length > 160)))) {
        return Response.json({error:'Invalid giveaway selection.'},{status:400,headers:cors});
      }
      const {data,error}=await admin.rpc(snapshot ? 'tdqsys_giveaway_snapshot' : 'tdqsys_set_giveaway',snapshot
        ? {p_instance_id:instanceId}
        : {p_instance_id:instanceId,p_registration_id:body.registrationId,p_item:body.item,p_expected_item:body.expectedItem});
      if(error)return Response.json({error:error.message},{status:error.code==='P0001'?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if (['giveaway-inventory','giveaway-stock','dashboard-snapshot'].includes(body.action)) {
      if(body.action==='giveaway-stock' && (typeof body.item!=='string' || body.item.length>160 || !Number.isInteger(body.quantity)
        || body.quantity<1 || body.quantity>100000000 || typeof body.runId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.runId) || typeof body.requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.requestId))) {
        return Response.json({error:'Enter a valid stock quantity.'},{status:400,headers:cors});
      }
      if(body.action!=='giveaway-stock' && !body.runId){const {error}=await admin.rpc('tdqsys_ensure_daily_run',{p_instance_id:instanceId});if(error)throw error;}
      if(body.action==='dashboard-snapshot' && body.runId!=null && (typeof body.runId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.runId))) {
        return Response.json({error:'Invalid queue run.'},{status:400,headers:cors});
      }
      const rpc=body.action==='giveaway-stock'?'tdqsys_add_giveaway_stock':body.action==='giveaway-inventory'?'tdqsys_giveaway_stock_history':'tdqsys_dashboard_snapshot';
      const args=body.action==='giveaway-stock'?{p_instance_id:instanceId,p_item:body.item,p_quantity:body.quantity,p_kind:'replenishment',p_request_id:body.requestId,p_expected_run:body.runId}
        :body.action==='dashboard-snapshot'?{p_instance_id:instanceId,p_run_id:body.runId || null}:{p_instance_id:instanceId};
      const {data,error}=await admin.rpc(rpc,args);
      if(error)return Response.json({error:error.message},{status:error.code==='P0001'?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if(['cleanup-preview','cleanup-apply'].includes(body.action)) {
      if(!['selected','clean'].includes(body.mode) || !Array.isArray(body.runIds) || body.runIds.length>100 || body.runIds.some(id=>typeof id!=='string' || !/^[0-9a-f-]{36}$/i.test(id)))return Response.json({error:'Invalid cleanup scope.'},{status:400,headers:cors});
      if(body.action==='cleanup-apply' && (typeof body.fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(body.fingerprint) || typeof body.requestId!=='string' || !/^[0-9a-f-]{36}$/i.test(body.requestId)))return Response.json({error:'A verified backup is required.'},{status:400,headers:cors});
      const {data,error}=await admin.rpc(body.action==='cleanup-preview'?'tdqsys_cleanup_preview':'tdqsys_cleanup_apply',{
        p_instance_id:instanceId,p_mode:body.mode,p_run_ids:body.runIds,...(body.action==='cleanup-apply'?{p_fingerprint:body.fingerprint,p_confirmation:body.confirmation,p_request_id:body.requestId}:{})});
      if(error)return Response.json({error:error.message},{status:['P0001','55P03'].includes(error.code)?409:503,headers:cors});
      return Response.json(data,{headers:cors});
    }
    if (body.action === 'cancel-print' && body.jobId) {
      const {data,error}=await admin.rpc('tdqsys_cancel_print_job',{p_instance_id:instanceId,p_job_id:body.jobId});
      if(error)throw error;
      return Response.json(data,{headers:cors});
    }
    if (body.action === 'claim-print' && body.jobId) {
      const { data: label, error } = await admin.rpc('tdqsys_claim_print_job', { p_instance_id: instanceId, p_job_id: body.jobId });
      if (error) throw error;
      if (label.kind === 'se_code_slip') {
        label.value = await decryptSeCode(label.ciphertext,Deno.env.get('TEST_DRIVE_CODE_ENCRYPTION_KEY'));
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
      const { error } = await admin.rpc(body.dealerships===undefined ? 'tdqsys_configure_test_drive' : 'tdqsys_configure_registration', {
        p_instance_id: instanceId, p_models: body.models, p_waiver: body.waiver, p_terms: body.terms, p_sheets_url: body.sheetsUrl || '',
        ...(body.dealerships===undefined ? {} : {p_dealerships:body.dealerships})
      });
      if (error) throw error;
      if(body.giveawayItems!==undefined) {
        const {error:giveawayError}=await admin.rpc(body.giveawayStockOpenings===undefined?'tdqsys_configure_giveaways':'tdqsys_configure_inventory',
          {p_instance_id:instanceId,p_items:body.giveawayItems,...(body.giveawayStockOpenings===undefined?{}:{p_openings:body.giveawayStockOpenings})});
        if(giveawayError)throw giveawayError;
      }
      return Response.json({ configured: true }, { headers: cors });
    }
    if (body.action === 'reset-sales-executives') {
      if (body.confirm !== true || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 240) {
        return Response.json({error:'Confirm the Agent reset and provide a reason.'},{status:400,headers:cors});
      }
      const {data,error} = await admin.rpc('tdqsys_reset_sales_executives',{p_instance_id:instanceId,p_reason:body.reason.trim()});
      if (error) throw error;
      return Response.json(data,{headers:cors});
    }
    if (body.action === 'reprint-se-code' && body.checkinId) {
      const {data,error}=await admin.rpc('tdqsys_reprint_se_code',{p_instance_id:instanceId,p_checkin_id:body.checkinId});
      if(error)throw error;
      return Response.json(data,{headers:cors});
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
        .select('*,registrations(full_name,email,city_address,contact_number,se_daily_checkins(code_ciphertext,sales_executives(name)))')
        .eq('instance_id', instanceId).eq('queue_run_id', run.id).order('queue_number');
      if (entryError) throw entryError;
      const { data: printJobs, error: printError } = await admin.from('print_jobs').select('*,se_daily_checkins(expires_at,code_ciphertext,sales_executives(name))')
        .eq('instance_id', instanceId).in('status', ['pending', 'claimed', 'failed']).order('created_at');
      if (printError) throw printError;
      const activeIds = new Set((entries || []).map(e => e.id));
      let earlierEntries = [];
      if (body.history === true) {
        const { data: earlierRuns, error } = await admin.from('queue_runs').select('id').eq('instance_id', instanceId).eq('operating_day', run.operating_day).eq('status','closed');
        if (error) throw error;
        if (earlierRuns?.length) {
          const { data, error: historyError } = await admin.from('test_drive_entries').select('*,registrations(full_name,email,city_address,contact_number,se_daily_checkins(code_ciphertext,sales_executives(name))),vehicle_models(full_name)')
            .eq('instance_id', instanceId).in('queue_run_id',earlierRuns.map(r => r.id)).order('issued_at');
          if (historyError) throw historyError;
          earlierEntries = data || [];
        }
      }
      const { data: display, error: displayError } = await admin.from('display_state').select('*').eq('instance_id', instanceId).maybeSingle();
      if (displayError) throw displayError;
      const agentCodes=new Map();
      for(const entry of [...(entries||[]),...earlierEntries]) {
        const checkin=entry.registrations?.se_daily_checkins;
        if(checkin) {
          entry.agentName=checkin.sales_executives?.name || '';
          if(body.includeAgentCodes===true) {
            if(!agentCodes.has(checkin.code_ciphertext))agentCodes.set(checkin.code_ciphertext,await decryptSeCode(checkin.code_ciphertext,Deno.env.get('TEST_DRIVE_CODE_ENCRYPTION_KEY')));
            entry.agentCode=agentCodes.get(checkin.code_ciphertext);
          }
          delete entry.registrations.se_daily_checkins;
        }
      }
      const pendingPrintJobs = (printJobs || []).filter(j => j.kind === 'se_code_slip'
        ? new Date(j.se_daily_checkins?.expires_at || 0).getTime() > Date.now() : activeIds.has(j.test_drive_entry_id));
      for (const job of pendingPrintJobs) {
        const checkin = job.se_daily_checkins;
        if (job.kind === 'se_code_slip' && body.includePrintCodes === true) job.seCode = await decryptSeCode(checkin.code_ciphertext,Deno.env.get('TEST_DRIVE_CODE_ENCRYPTION_KEY'));
        if (checkin) delete checkin.code_ciphertext;
      }
      const seCheckins = [];
      if (body.includeSalesExecutives === true) {
        let query = admin.from('se_daily_checkins').select('id,operating_day,expires_at,revoked_at,code_ciphertext,sales_executives(name,dealership)').eq('instance_id',instanceId);
        if (body.salesHistory !== true) query = query.eq('operating_day',run.operating_day).is('revoked_at',null);
        const { data: checkins, error: checkinError } = await query.order('issued_at',{ascending:false});
        if (checkinError) throw checkinError;
        for (const checkin of checkins || []) {
          const active = !checkin.revoked_at && new Date(checkin.expires_at).getTime() > Date.now();
          seCheckins.push({id:checkin.id,name:checkin.sales_executives?.name,dealership:checkin.sales_executives?.dealership,
            operatingDay:checkin.operating_day,expiresAt:checkin.expires_at,revokedAt:checkin.revoked_at,code:active ? await decryptSeCode(checkin.code_ciphertext,Deno.env.get('TEST_DRIVE_CODE_ENCRYPTION_KEY')) : null});
        }
      }
      const {data:modelDisplays,error:modelDisplayError}=await admin.from('queue_model_display').select('vehicle_model_id,queue_number').eq('queue_run_id',run.id);
      if(modelDisplayError)throw modelDisplayError;
      const {data:locationSettings,error:locationError}=await admin.from('test_drive_settings').select('timezone').eq('instance_id',instanceId).maybeSingle();
      if(locationError)throw locationError;
      return Response.json({ run, timezone:locationSettings?.timezone || 'Asia/Manila', models, entries, earlierEntries, display, modelDisplays, seCheckins, printJobs:pendingPrintJobs }, { headers: cors });
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
      const { data, error } = await admin.from('test_drive_entries').select('queue_number,vehicle_models(full_name,brand_key,unit_index),queue_runs(status)')
        .eq('id',body.entryId).eq('instance_id',instanceId).single();
      if (error) throw error;
      if (data.queue_runs.status !== 'active') throw new Error('This ticket belongs to an earlier run.');
      return Response.json({ticket:data.queue_number,modelName:data.vehicle_models.full_name,model:{brand_key:data.vehicle_models.brand_key,unit_index:data.vehicle_models.unit_index}},{headers:cors});
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
