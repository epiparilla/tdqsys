begin;
-- Reuse the existing private, backed-up audit ledger for correction receipts.
create unique index if not exists giveaway_correction_request on public.audit_log(instance_id,(details->>'requestId')) where action='giveaway-correction';

create or replace function public.tdqsys_correct_giveaway(p_instance_id text,p_kind text,p_target text,p_expected jsonb,p_value jsonb,p_reason text,p_operator text,p_request_id uuid,p_expected_run uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run uuid;v_receipt jsonb;v_request jsonb;v_before jsonb;v_after jsonb;v_item text;v_remaining bigint;v_opening integer;v_registration uuid;v_time timestamptz;
begin
 if p_request_id is null or p_kind not in ('claims','opening') or p_kind is null or p_target is null or length(btrim(p_target)) not between 1 and 160
 or p_reason is null or length(btrim(p_reason)) not between 3 and 500 or p_operator is null or length(btrim(p_operator)) not between 1 and 120 then raise exception 'provide the operator name and a correction reason';end if;
 v_request:=jsonb_build_object('kind',p_kind,'target',p_target,'expected',p_expected,'value',p_value,'reason',btrim(p_reason),'operator',btrim(p_operator),'runId',p_expected_run);
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 if v_run is distinct from p_expected_run or not exists(select 1 from queue_runs where id=v_run and instance_id=p_instance_id and status='active' and giveaway_reset) then raise exception 'run changed or is read-only; refresh before correcting';end if;
 v_time:=clock_timestamp();
 select details into v_receipt from audit_log where instance_id=p_instance_id and action='giveaway-correction' and details->>'requestId'=p_request_id::text;
 if found then
  if v_receipt->'request' is distinct from v_request then raise exception 'correction request ID already used for different values';end if;
  return (v_receipt->'result')||jsonb_build_object('replayed',true);
 end if;
 if p_kind='claims' then
  v_registration:=p_target::uuid;
  perform 1 from registrations where id=v_registration and instance_id=p_instance_id for update;
  if not found then raise exception 'registration not found for this location';end if;
  if p_expected is null or jsonb_typeof(p_expected)<>'array' or p_value is null or jsonb_typeof(p_value)<>'array' then raise exception 'invalid correction selection';end if;
  if jsonb_array_length(p_value)>200 or exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 160) then raise exception 'invalid correction items';end if;
  if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_value))<>jsonb_array_length(p_value) then raise exception 'select each item once';end if;
  select coalesce(jsonb_agg(item order by item),'[]'::jsonb) into v_before from registration_giveaways where instance_id=p_instance_id and queue_run_id=v_run and registration_id=v_registration;
  if v_before is distinct from (select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from jsonb_array_elements_text(p_expected)) then raise exception 'giveaway selection changed; close, refresh and review again';end if;
  select coalesce(jsonb_agg(btrim(value) order by btrim(value)),'[]'::jsonb) into v_after from jsonb_array_elements_text(p_value);
  if v_before=v_after then raise exception 'no giveaway correction selected';end if;
  -- Validate every addition before restoring/removing or deducting anything.
  for v_item in select value from jsonb_array_elements_text(v_after) where not v_before ? value loop
   if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=v_item) then raise exception 'select configured giveaway items';end if;
   select (value->>'remaining')::bigint into v_remaining from jsonb_array_elements(tdqsys_inventory_snapshot(p_instance_id)) where value->>'item'=v_item;
   if coalesce(v_remaining,0)<1 then raise exception 'a replacement item is out of stock; nothing was corrected';end if;
  end loop;
  for v_item in select value from jsonb_array_elements_text(v_before) where not v_after ? value loop
   delete from registration_giveaways where instance_id=p_instance_id and queue_run_id=v_run and registration_id=v_registration and item=v_item;
   insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,source,created_at) values(p_instance_id,v_registration,v_item,-1,v_run,'correction-return',v_time);
  end loop;
  for v_item in select value from jsonb_array_elements_text(v_after) where not v_before ? value loop
   insert into registration_giveaways(instance_id,registration_id,item,queue_run_id,issued_at) values(p_instance_id,v_registration,v_item,v_run,v_time);
   insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,source,created_at) values(p_instance_id,v_registration,v_item,1,v_run,'correction-issue',v_time);
  end loop;
  update registrations set giveaway_item=v_after->>0,giveaway_updated_at=v_time where id=v_registration;
 else
  if p_value is null or jsonb_typeof(p_value)<>'number' or p_value::text !~ '^[0-9]+$' or p_value::numeric>100000000 then raise exception 'beginning balance must be a whole number from 0 to 100000000';end if;
  select quantity into v_opening from giveaway_stock_events where instance_id=p_instance_id and queue_run_id=v_run and item=p_target and kind='opening' for update;
  if not found then raise exception 'save a beginning balance before correcting it';end if;
  v_before:=to_jsonb(v_opening);v_after:=p_value;
  if v_before is distinct from p_expected then raise exception 'beginning balance changed; close, refresh and review again';end if;
  if v_before=v_after then raise exception 'no beginning balance change';end if;
  select (value->>'remaining')::bigint into v_remaining from jsonb_array_elements(tdqsys_inventory_snapshot(p_instance_id)) where value->>'item'=p_target;
  if coalesce(v_remaining,0)-v_opening+(p_value::text)::integer<0 then raise exception 'corrected balance would make remaining stock negative';end if;
  -- Original and corrected quantities are retained atomically in audit_log.
  update giveaway_stock_events set quantity=(p_value::text)::integer where instance_id=p_instance_id and queue_run_id=v_run and item=p_target and kind='opening';
 end if;
 v_receipt:=jsonb_build_object('saved',true,'replayed',false,'runId',v_run,'before',v_before,'after',v_after);
 insert into audit_log(instance_id,actor_type,actor_id,action,target_type,target_id,details,created_at)
 values(p_instance_id,'facilitator',btrim(p_operator),'giveaway-correction','queue-run',v_run::text,jsonb_build_object('requestId',p_request_id,'request',v_request,'result',v_receipt),v_time);
 return v_receipt;
end $$;

create or replace function public.tdqsys_giveaway_correction_history(p_instance_id text,p_run_id uuid,p_kind text,p_target text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('history',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from
 (select a.id,a.created_at,a.actor_id,a.details from audit_log a join queue_runs q on q.id=p_run_id and q.instance_id=p_instance_id
 where a.instance_id=p_instance_id and a.action='giveaway-correction' and a.target_id=p_run_id::text and a.details->'request'->>'kind'=p_kind and a.details->'request'->>'target'=p_target order by a.created_at desc,a.id desc limit 200) e),'[]'::jsonb));
$$;
revoke all on function public.tdqsys_correct_giveaway(text,text,text,jsonb,jsonb,text,text,uuid,uuid),public.tdqsys_giveaway_correction_history(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tdqsys_correct_giveaway(text,text,text,jsonb,jsonb,text,text,uuid,uuid),public.tdqsys_giveaway_correction_history(text,uuid,text,text) to service_role;
commit;
