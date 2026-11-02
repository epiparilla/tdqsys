begin;
create or replace function public.tdqsys_reissue_ticket(p_instance_id text,p_entry_id uuid,p_model_id uuid default null,p_cancel_source boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_entry test_drive_entries; v_run uuid; v_model uuid; v_number integer; v_id uuid; v_job uuid; v_display integer; v_highest integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  select * into old_entry from test_drive_entries where id=p_entry_id and instance_id=p_instance_id for update;
  if not found then raise exception 'entry not found'; end if;
  select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
  if v_run is null then raise exception 'open a queue run first'; end if;
  v_model:=coalesce(p_model_id,old_entry.vehicle_model_id);
  if p_cancel_source and (old_entry.queue_run_id<>v_run or old_entry.status<>'waiting') then raise exception 'only a current waiting entry can change model'; end if;
  if not exists(select 1 from vehicle_models where id=v_model and instance_id=p_instance_id and active) then raise exception 'model unavailable'; end if;
  select coalesce(max(d.queue_number),0) into v_display from queue_model_display d where d.queue_run_id=v_run and d.vehicle_model_id=v_model;
  if p_model_id is not null and exists(select 1 from test_drive_entries e where e.registration_id=old_entry.registration_id
      and e.queue_run_id=v_run and e.vehicle_model_id=v_model and e.status in ('waiting','ongoing','done') and e.queue_number>=v_display)
    then raise exception 'client already has an unpassed ticket for this model'; end if;
  if p_model_id is null and old_entry.queue_run_id=v_run and old_entry.status not in ('cancelled','no_show') and old_entry.queue_number>=v_display then
    if exists(select 1 from print_jobs where test_drive_entry_id=p_entry_id and status='claimed') then raise exception 'ticket is being printed; check physical output first'; end if;
    select id into v_job from print_jobs where test_drive_entry_id=p_entry_id and status in ('pending','failed') order by created_at limit 1;
    if v_job is null then
      insert into print_jobs(instance_id,kind,test_drive_entry_id) values(p_instance_id,'client_ticket',p_entry_id) returning id into v_job;
    end if;
    insert into audit_log(instance_id,actor_type,action,target_type,target_id) values(p_instance_id,'desktop','ticket_reprint','test_drive_entry',p_entry_id::text);
    return jsonb_build_object('entryId',p_entry_id,'queueNumber',old_entry.queue_number,'jobId',v_job,'reprint',true);
  end if;
  select greatest(coalesce(max(e.queue_number),0),v_display) into v_highest from test_drive_entries e where e.queue_run_id=v_run and e.vehicle_model_id=v_model;
  insert into queue_counters(queue_run_id,vehicle_model_id,last_issued_number) values(v_run,v_model,v_highest+1)
    on conflict(queue_run_id,vehicle_model_id) do update set last_issued_number=greatest(queue_counters.last_issued_number,v_highest)+1,updated_at=now()
    returning last_issued_number into v_number;
  insert into test_drive_entries(instance_id,registration_id,queue_run_id,vehicle_model_id,queue_number,replaced_entry_id)
    values(p_instance_id,old_entry.registration_id,v_run,v_model,v_number,p_entry_id) returning id into v_id;
  insert into print_jobs(instance_id,kind,test_drive_entry_id) values(p_instance_id,'client_ticket',v_id) returning id into v_job;
  if p_cancel_source then
    update test_drive_entries set status='cancelled',status_changed_at=now(),status_changed_by='desktop' where id=p_entry_id;
  end if;
  if p_cancel_source or p_model_id is null then
    update print_jobs set status='cancelled',updated_at=now() where test_drive_entry_id=p_entry_id and status in ('pending','failed');
  end if;
  insert into audit_log(instance_id,actor_type,action,target_type,target_id,details)
    values(p_instance_id,'desktop','ticket_issued_from_existing','test_drive_entry',v_id::text,jsonb_build_object('sourceEntryId',p_entry_id));
  return jsonb_build_object('entryId',v_id,'queueNumber',v_number,'jobId',v_job,'reprint',false);
end; $$;
revoke all on function public.tdqsys_reissue_ticket(text,uuid,uuid,boolean) from public;
grant execute on function public.tdqsys_reissue_ticket(text,uuid,uuid,boolean) to service_role;

create or replace function public.tdqsys_cancel_print_job(p_instance_id text,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  update print_jobs set status='cancelled',updated_at=now() where id=p_job_id and instance_id=p_instance_id and status in ('pending','failed');
  if not found then raise exception 'only pending or failed print jobs can be cancelled; check claimed output first'; end if;
  insert into audit_log(instance_id,actor_type,action,target_type,target_id) values(p_instance_id,'desktop','print_cancelled','print_job',p_job_id::text);
  return jsonb_build_object('cancelled',true);
end $$;
revoke all on function public.tdqsys_cancel_print_job(text,uuid) from public;
grant execute on function public.tdqsys_cancel_print_job(text,uuid) to service_role;
commit;
