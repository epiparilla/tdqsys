begin;
create or replace function public.tdqsys_open_simulation_run(p_instance_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run uuid;v_zone text;v_new uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 if exists(select 1 from test_drive_entries where queue_run_id=v_run) or exists(select 1 from giveaway_stock_events where queue_run_id=v_run) or exists(select 1 from giveaway_claim_events where queue_run_id=v_run) then raise exception 'current run is not empty; stop and use Reset to Zero / Open run before testing';end if;
 select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
 select id into v_new from tdqsys_open_queue_run(p_instance_id,(now() at time zone coalesce(v_zone,'Asia/Manila'))::date,'[SIMULATION] Settings registration test','desktop simulation');
 return jsonb_build_object('runId',v_new);
end $$;
create or replace function public.tdqsys_simulation_registration(p_instance_id text,p_run_id uuid,p_kind text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 if v_run is distinct from p_run_id or not exists(select 1 from queue_runs where id=v_run and instance_id=p_instance_id and status='active' and reset_reason='[SIMULATION] Settings registration test') then raise exception 'simulation run changed; test registration stopped';end if;
 if p_data->>'p_instance_id' is distinct from p_instance_id then raise exception 'simulation location mismatch';end if;
 if p_kind='agent' and p_data->>'p_name' like 'TEST %' then
  return to_jsonb(tdqsys_register_se_checkin(p_instance_id,p_data->>'p_name',p_data->>'p_dealership',(p_data->>'p_operating_day')::date,p_data->>'p_code_hash',p_data->>'p_code_ciphertext',(p_data->>'p_expires_at')::timestamptz,p_data->>'p_contact_number'));
 elsif p_kind='client' and p_data->>'p_full_name' like 'TEST %' then
  return tdqsys_submit_registration(p_instance_id,p_data->>'p_full_name',p_data->>'p_name_search',p_data->>'p_email',p_data->>'p_city_address',p_data->>'p_contact_number',(p_data->>'p_for_application')::boolean,(p_data->>'p_for_reservation')::boolean,p_data->>'p_code_hash',p_data->>'p_waiver_version',p_data->>'p_terms_version',p_data->>'p_idempotency_key',array(select value::uuid from jsonb_array_elements_text(p_data->'p_model_ids')));
 end if;
 raise exception 'invalid simulation registration';
end $$;
revoke all on function public.tdqsys_open_simulation_run(text),public.tdqsys_simulation_registration(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tdqsys_open_simulation_run(text),public.tdqsys_simulation_registration(text,uuid,text,jsonb) to service_role;
commit;
