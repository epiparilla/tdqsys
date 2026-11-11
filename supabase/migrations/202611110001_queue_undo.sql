begin;
-- Preserve the existing idempotent handler for ordinary actions and add a
-- guarded, model-scoped compensation for desktop Undo/Redo.
alter function public.tdqsys_apply_local_operation(text,jsonb) rename to tdqsys_apply_local_operation_v1;
create function public.tdqsys_apply_local_operation(p_instance_id text,p_operation jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_id uuid; v_run uuid; v_entry test_drive_entries; v_receipt tdqsys_local_operation_receipts;
 v_expected jsonb; v_target jsonb; v_item jsonb; v_result jsonb; v_number integer; v_active uuid;
begin
 if coalesce(p_operation->>'action','')<>'restore-ongoing' then
   return tdqsys_apply_local_operation_v1(p_instance_id,p_operation);
 end if;
 if p_instance_id !~ '^[0-9a-f-]{1,64}$' or jsonb_typeof(p_operation)<>'object' then raise exception 'invalid local operation'; end if;
 v_id:=(p_operation->>'id')::uuid; v_run:=(p_operation->>'runId')::uuid;
 if v_id is null or v_run is null or p_operation->>'entryId' is null then raise exception 'invalid local operation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 select * into v_receipt from tdqsys_local_operation_receipts where instance_id=p_instance_id and operation_id=v_id;
 if found then
   if v_receipt.payload<>p_operation then raise exception 'operation ID already used for different content'; end if;
   return v_receipt.result;
 end if;
 if not exists(select 1 from queue_runs r join test_drive_settings s on s.instance_id=r.instance_id where r.id=v_run and r.instance_id=p_instance_id and r.status='active' and r.operating_day=(now() at time zone s.timezone)::date) then raise exception 'queue run is no longer current'; end if;
 select * into v_entry from test_drive_entries where id=(p_operation->>'entryId')::uuid and instance_id=p_instance_id and queue_run_id=v_run for update;
 if not found then raise exception 'ticket does not belong to this location and queue run'; end if;
 v_expected:=p_operation->'expected'; v_target:=p_operation->'target';
 if jsonb_typeof(v_expected->'entries') is distinct from 'array' or jsonb_typeof(v_target->'entries') is distinct from 'array' then raise exception 'invalid restoration entries'; end if;
 if jsonb_array_length(v_expected->'entries') not between 1 and 2 or jsonb_array_length(v_target->'entries')<>jsonb_array_length(v_expected->'entries') then raise exception 'invalid restoration entries'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(v_target->'entries') x)<>jsonb_array_length(v_target->'entries') then raise exception 'duplicate restoration entries'; end if;
 if coalesce(v_expected->>'number','')!~ '^[0-9]+$' or coalesce(v_target->>'number','')!~ '^[0-9]+$' then raise exception 'invalid display number'; end if;
 select coalesce(max(queue_number),0) into v_number from queue_model_display where queue_run_id=v_run and vehicle_model_id=v_entry.vehicle_model_id;
 if v_number<>(v_expected->>'number')::integer then raise exception 'display changed; cannot restore'; end if;
 for v_item in select value from jsonb_array_elements(v_target->'entries') loop
   if coalesce(v_item->>'status','') not in ('waiting','ongoing','done') or not exists(select 1 from jsonb_array_elements(v_expected->'entries') x where x->>'id'=v_item->>'id') then raise exception 'invalid restoration status'; end if;
 end loop;
 for v_item in select value from jsonb_array_elements(v_expected->'entries') loop
   if not exists(select 1 from test_drive_entries e where e.id=(v_item->>'id')::uuid and e.instance_id=p_instance_id and e.queue_run_id=v_run and e.vehicle_model_id=v_entry.vehicle_model_id and e.status=v_item->>'status') then raise exception 'client status changed; cannot restore'; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_target->'entries') x where x->>'id'=v_entry.id::text) then raise exception 'restoration must include selected ticket'; end if;
 if exists(select 1 from test_drive_entries e where e.queue_run_id=v_run and e.vehicle_model_id=v_entry.vehicle_model_id and e.status='ongoing' and not exists(select 1 from jsonb_array_elements(v_expected->'entries') x where x->>'id'=e.id::text and x->>'status'='ongoing')) then raise exception 'another client is ongoing'; end if;
 if (select count(*) from jsonb_array_elements(v_target->'entries') x where x->>'status'='ongoing')>1 then raise exception 'only one ongoing client per model'; end if;
 select e.id into v_active from test_drive_entries e join jsonb_array_elements(v_target->'entries') x on x->>'id'=e.id::text where x->>'status'='ongoing';
 if v_active is not null and not exists(select 1 from test_drive_entries where id=v_active and queue_number=(v_target->>'number')::integer) then raise exception 'restored number does not match ongoing ticket'; end if;
 if v_active is null and (v_target->>'number')::integer<>0 and not exists(select 1 from test_drive_entries where queue_run_id=v_run and vehicle_model_id=v_entry.vehicle_model_id and queue_number=(v_target->>'number')::integer) then raise exception 'restored number is not assigned'; end if;
 -- Clear the existing Ongoing first to respect the per-model unique index.
 update test_drive_entries set status='done',status_changed_at=now() where queue_run_id=v_run and vehicle_model_id=v_entry.vehicle_model_id and status='ongoing';
 for v_item in select value from jsonb_array_elements(v_target->'entries') loop
   update test_drive_entries set status=v_item->>'status',status_changed_at=now() where id=(v_item->>'id')::uuid;
 end loop;
 insert into queue_model_display(queue_run_id,vehicle_model_id,queue_number) values(v_run,v_entry.vehicle_model_id,(v_target->>'number')::integer)
 on conflict(queue_run_id,vehicle_model_id) do update set queue_number=excluded.queue_number;
 update display_state d set active_test_drive_entry_id=v_active,updated_at=now() where d.instance_id=p_instance_id and d.queue_run_id=v_run and (d.active_test_drive_entry_id is null or exists(select 1 from test_drive_entries e where e.id=d.active_test_drive_entry_id and e.vehicle_model_id=v_entry.vehicle_model_id));
 insert into audit_log(instance_id,actor_type,action,actor_id,target_type,target_id,details) values(p_instance_id,'facilitator','restore_ongoing','desktop-local-sync','test_drive_entry',v_entry.id::text,p_operation);
 v_result:=jsonb_build_object('operationId',v_id);
 insert into tdqsys_local_operation_receipts(instance_id,operation_id,queue_run_id,payload,result) values(p_instance_id,v_id,v_run,p_operation,v_result);
 return v_result;
end $$;
revoke all on function public.tdqsys_apply_local_operation(text,jsonb) from public,anon,authenticated;
grant execute on function public.tdqsys_apply_local_operation(text,jsonb) to service_role;
commit;
