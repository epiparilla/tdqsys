begin;
create table if not exists public.tdqsys_local_operation_receipts (
  instance_id text not null, operation_id uuid not null, queue_run_id uuid not null references public.queue_runs(id),
  payload jsonb not null, result jsonb not null, received_at timestamptz not null default now(),
  primary key(instance_id,operation_id)
);
alter table public.tdqsys_local_operation_receipts enable row level security;
revoke all on public.tdqsys_local_operation_receipts from anon,authenticated;
grant all on public.tdqsys_local_operation_receipts to service_role;

create or replace function public.tdqsys_apply_local_operation(p_instance_id text,p_operation jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_run uuid; v_entry test_drive_entries; v_receipt tdqsys_local_operation_receipts; v_result jsonb; v_model vehicle_models;
begin
  if p_instance_id !~ '^[0-9a-f-]{1,64}$' or jsonb_typeof(p_operation)<>'object' then raise exception 'invalid local operation'; end if;
  v_id:=(p_operation->>'id')::uuid; v_run:=(p_operation->>'runId')::uuid;
  if v_id is null or v_run is null or (p_operation->>'entryId') is null or coalesce(p_operation->>'action','') not in ('ongoing','status') then raise exception 'invalid local operation'; end if;
  if p_operation->>'action'='status' and coalesce(p_operation->>'status','') not in ('done','no_show','cancelled') then raise exception 'invalid local status'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  select * into v_receipt from tdqsys_local_operation_receipts where instance_id=p_instance_id and operation_id=v_id;
  if found then
    if v_receipt.payload<>p_operation then raise exception 'operation ID already used for different content'; end if;
    return v_receipt.result;
  end if;
  if not exists(select 1 from queue_runs r join test_drive_settings s on s.instance_id=r.instance_id
    where r.id=v_run and r.instance_id=p_instance_id and r.status='active' and r.operating_day=(now() at time zone s.timezone)::date) then
    raise exception 'queue run is no longer current; review unsynced local actions';
  end if;
  select * into v_entry from test_drive_entries where id=(p_operation->>'entryId')::uuid and instance_id=p_instance_id and queue_run_id=v_run for update;
  if not found then raise exception 'ticket does not belong to this location and queue run'; end if;
  if p_operation->>'action'='ongoing' then
    select * into v_entry from tdqsys_set_ongoing(v_entry.id,'desktop-local-sync');
  else
    select * into v_entry from tdqsys_mark_entry(p_instance_id,v_entry.id,p_operation->>'status');
  end if;
  select * into v_model from vehicle_models where id=v_entry.vehicle_model_id and instance_id=p_instance_id;
  v_result:=jsonb_build_object('operationId',v_id,'entry',to_jsonb(v_entry),'model',jsonb_build_object('brand_key',v_model.brand_key,'unit_index',v_model.unit_index));
  insert into tdqsys_local_operation_receipts(instance_id,operation_id,queue_run_id,payload,result) values(p_instance_id,v_id,v_run,p_operation,v_result);
  return v_result;
end $$;
revoke all on function public.tdqsys_apply_local_operation(text,jsonb) from public;
grant execute on function public.tdqsys_apply_local_operation(text,jsonb) to service_role;
commit;
