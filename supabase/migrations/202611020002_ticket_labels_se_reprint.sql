begin;
create or replace function public.tdqsys_claim_print_job(p_instance_id text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j print_jobs; e test_drive_entries; c se_daily_checkins; v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  select * into j from print_jobs where id=p_job_id and instance_id=p_instance_id for update;
  if not found or j.status not in ('pending','failed') then raise exception 'print job not available'; end if;
  if j.kind='client_ticket' then
    select t.* into e from test_drive_entries t join queue_runs r on r.id=t.queue_run_id
      where t.id=j.test_drive_entry_id and r.status='active' and t.instance_id=p_instance_id;
    if not found or e.status in ('cancelled','no_show') then raise exception 'ticket no longer available'; end if;
    if exists(select 1 from queue_model_display where queue_run_id=e.queue_run_id and vehicle_model_id=e.vehicle_model_id and queue_number>e.queue_number)
      then raise exception 'queue number passed; issue a new ticket'; end if;
    select jsonb_build_object('header',m.printable_shortname,'value',lpad(e.queue_number::text,greatest(2,length(e.queue_number::text)),'0'),
      'queueNumber',e.queue_number,'brandKey',m.brand_key,'unit',m.unit_index,'name',r.full_name)
      into v_result from vehicle_models m,registrations r where m.id=e.vehicle_model_id and r.id=e.registration_id;
  else
    select * into c from se_daily_checkins where id=j.se_daily_checkin_id and instance_id=p_instance_id and expires_at>now() and revoked_at is null;
    if not found then raise exception 'SE code expired'; end if;
    select jsonb_build_object('header',s.name,'ciphertext',c.code_ciphertext) into v_result from sales_executives s where s.id=c.sales_executive_id;
  end if;
  update print_jobs set status='claimed',claimed_at=now(),attempt_count=attempt_count+1,updated_at=now() where id=p_job_id;
  return v_result||jsonb_build_object('jobId',j.id,'kind',j.kind);
end $$;

create or replace function public.tdqsys_reprint_se_code(p_instance_id text,p_checkin_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_job uuid; v_checkin se_daily_checkins;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  select * into v_checkin from se_daily_checkins where id=p_checkin_id and instance_id=p_instance_id and expires_at>now() and revoked_at is null for update;
  if not found then raise exception 'SE code expired or reset; register again'; end if;
  if exists(select 1 from print_jobs where se_daily_checkin_id=p_checkin_id and status='claimed') then raise exception 'SE slip is being printed; check its physical output first'; end if;
  select id into v_job from print_jobs where se_daily_checkin_id=p_checkin_id and status in ('pending','failed') order by created_at limit 1;
  if not found then
    insert into print_jobs(instance_id,kind,se_daily_checkin_id) values(p_instance_id,'se_code_slip',p_checkin_id) returning id into v_job;
    insert into audit_log(instance_id,actor_type,actor_id,action,target_type,target_id,details)
      values(p_instance_id,'desktop','facilitator','se_code_reprint_queued','se_daily_checkin',p_checkin_id::text,jsonb_build_object('printJobId',v_job));
  end if;
  return jsonb_build_object('jobId',v_job,'queued',true);
end $$;
revoke all on function public.tdqsys_reprint_se_code(text,uuid) from public;
grant execute on function public.tdqsys_reprint_se_code(text,uuid) to service_role;
revoke all on function public.tdqsys_claim_print_job(text,uuid) from public;
grant execute on function public.tdqsys_claim_print_job(text,uuid) to service_role;
commit;
