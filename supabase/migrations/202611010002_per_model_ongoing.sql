-- Each vehicle model has its own ongoing client. Never complete another
-- model's test drive when advancing a column on the facilitator board.
begin;
drop index if exists public.test_drive_entries_one_ongoing_per_run;
create unique index if not exists test_drive_entries_one_ongoing_per_model
  on public.test_drive_entries(queue_run_id,vehicle_model_id) where status='ongoing';

create or replace function public.tdqsys_set_ongoing(p_entry_id uuid,p_actor_id text default null)
returns public.test_drive_entries language plpgsql security definer set search_path=public as $$
declare v_entry public.test_drive_entries;
begin
  select * into v_entry from test_drive_entries where id=p_entry_id;
  if not found then raise exception 'entry not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_entry.instance_id,0));
  select * into v_entry from test_drive_entries where id=p_entry_id for update;
  if not exists(select 1 from queue_runs where id=v_entry.queue_run_id and status='active') then raise exception 'entry is not in the active run'; end if;
  if v_entry.status not in ('waiting','ongoing') then raise exception 'entry cannot become ongoing'; end if;
  update test_drive_entries set status='done',status_changed_at=now(),status_changed_by=p_actor_id
    where queue_run_id=v_entry.queue_run_id and vehicle_model_id=v_entry.vehicle_model_id and status='ongoing' and id<>v_entry.id;
  update test_drive_entries set status='ongoing',status_changed_at=now(),status_changed_by=p_actor_id
    where id=v_entry.id returning * into v_entry;
  insert into display_state(instance_id,queue_run_id,active_test_drive_entry_id,updated_at)
    values(v_entry.instance_id,v_entry.queue_run_id,v_entry.id,now())
    on conflict(instance_id) do update set queue_run_id=excluded.queue_run_id,
      active_test_drive_entry_id=excluded.active_test_drive_entry_id,updated_at=now();
  insert into queue_model_display(queue_run_id,vehicle_model_id,queue_number)
    values(v_entry.queue_run_id,v_entry.vehicle_model_id,v_entry.queue_number)
    on conflict(queue_run_id,vehicle_model_id) do update set queue_number=excluded.queue_number;
  insert into audit_log(instance_id,actor_type,actor_id,action,target_type,target_id,details)
    values(v_entry.instance_id,'desktop',p_actor_id,'entry_ongoing','test_drive_entry',v_entry.id::text,jsonb_build_object('vehicleModelId',v_entry.vehicle_model_id));
  return v_entry;
end; $$;
revoke all on function public.tdqsys_set_ongoing(uuid,text) from public;
grant execute on function public.tdqsys_set_ongoing(uuid,text) to service_role;
commit;
