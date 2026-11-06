begin;
-- Security reservations are not visible event history; deleted code slips must
-- never become valid for a different SE after a clean slate.
create table if not exists public.tdqsys_retired_se_codes(instance_id text not null,code_hash text not null,primary key(instance_id,code_hash));
create table if not exists public.tdqsys_cleanup_receipts(instance_id text not null,request_id uuid not null,backup_hash text not null,mode text not null,run_ids uuid[] not null,result jsonb not null,primary key(instance_id,request_id));
alter table public.tdqsys_retired_se_codes enable row level security;
alter table public.tdqsys_cleanup_receipts enable row level security;
revoke all on public.tdqsys_retired_se_codes,public.tdqsys_cleanup_receipts from public,anon,authenticated;
grant all on public.tdqsys_retired_se_codes,public.tdqsys_cleanup_receipts to service_role;
create or replace function public.tdqsys_preserve_deleted_se_code() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then insert into tdqsys_retired_se_codes values(old.instance_id,old.code_hash) on conflict do nothing;return old;end if;
 if exists(select 1 from tdqsys_retired_se_codes where instance_id=new.instance_id and code_hash=new.code_hash) then raise unique_violation using message='previously issued SE code is reserved';end if;
 return new;
end $$;
create or replace trigger tdqsys_deleted_code_reserve before delete on public.se_daily_checkins for each row execute function public.tdqsys_preserve_deleted_se_code();
create or replace trigger tdqsys_retired_code_guard before insert on public.se_daily_checkins for each row execute function public.tdqsys_preserve_deleted_se_code();

create or replace function public.tdqsys_event_backup(p_instance_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb:='{}';v_table text;v_rows jsonb;
begin
 foreach v_table in array array['vehicle_models','sales_executives','se_daily_checkins','queue_runs','registrations','test_drive_entries','display_state','print_jobs','audit_log','test_drive_settings','tdqsys_local_operation_receipts','giveaway_stock_events','giveaway_claim_events','registration_giveaways','giveaway_issue_requests'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where instance_id=$1',v_table) into v_rows using p_instance_id;
 v:=v||jsonb_build_object(v_table,v_rows);
 end loop;
 foreach v_table in array array['queue_counters','queue_model_display'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where queue_run_id in(select id from queue_runs where instance_id=$1)',v_table) into v_rows using p_instance_id;
 v:=v||jsonb_build_object(v_table,v_rows);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into v_rows from sheet_sync_jobs t where registration_id in(select id from registrations where instance_id=p_instance_id);
 return jsonb_build_object('schema',1,'instanceId',p_instance_id,'tables',v||jsonb_build_object('sheet_sync_jobs',v_rows));
end $$;

create or replace function public.tdqsys_cleanup_preview(p_instance_id text,p_mode text,p_run_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_runs uuid[];v_regs uuid[];v_se uuid[];v_backup jsonb;v_summary jsonb;v_shared boolean;
begin
 if p_mode not in ('selected','clean') or p_mode is null then raise exception 'choose a cleanup mode';end if;
 if p_mode='clean' then select coalesce(array_agg(id),'{}'::uuid[]) into v_runs from queue_runs where instance_id=p_instance_id;
 else
  if coalesce(cardinality(p_run_ids),0) not between 1 and 100 then raise exception 'select between 1 and 100 closed test runs';end if;
  select array_agg(distinct id) into v_runs from queue_runs where instance_id=p_instance_id and id=any(p_run_ids) and status='closed';
  if coalesce(cardinality(v_runs),0)<>(select count(distinct id) from unnest(p_run_ids) id) then raise exception 'only closed runs belonging to this location may be deleted';end if;
 end if;
 select exists(select 1 from queue_runs where instance_id=p_instance_id and not giveaway_reset and not(id=any(v_runs)))
  and (exists(select 1 from giveaway_stock_events e join queue_runs r on r.id=e.queue_run_id where e.instance_id=p_instance_id and e.queue_run_id=any(v_runs) and not r.giveaway_reset) or exists(select 1 from giveaway_claim_events e join queue_runs r on r.id=e.queue_run_id where e.instance_id=p_instance_id and e.queue_run_id=any(v_runs) and not r.giveaway_reset)) into v_shared;
 if p_mode='selected' and v_shared then raise exception 'older runs share carried stock; open a new run and select all older legacy runs together, or use Clean slate';end if;
 select coalesce(array_agg(r.id),'{}'::uuid[]) into v_regs from registrations r where r.instance_id=p_instance_id and
 (p_mode='clean' or (exists(select 1 from test_drive_entries e where e.registration_id=r.id and e.queue_run_id=any(v_runs))
 and not exists(select 1 from test_drive_entries e where e.registration_id=r.id and not(e.queue_run_id=any(v_runs)))
 and not exists(select 1 from registration_giveaways g where g.registration_id=r.id and not(g.queue_run_id=any(v_runs)))
 and not exists(select 1 from giveaway_claim_events g where g.registration_id=r.id and (g.queue_run_id is null or not(g.queue_run_id=any(v_runs))))));
 select coalesce(array_agg(c.id),'{}'::uuid[]) into v_se from se_daily_checkins c where c.instance_id=p_instance_id and
 (p_mode='clean' or (exists(select 1 from queue_runs r where r.id=any(v_runs) and c.issued_at>=r.opened_at and c.issued_at<r.closed_at)
 and not exists(select 1 from registrations r where r.se_daily_checkin_id=c.id and not(r.id=any(v_regs)))));
 v_backup:=tdqsys_event_backup(p_instance_id);
 v_summary:=jsonb_build_object('runs',cardinality(v_runs),'registrations',cardinality(v_regs),'salesCheckins',cardinality(v_se),
  'tickets',(select count(*) from test_drive_entries where instance_id=p_instance_id and queue_run_id=any(v_runs)),
  'stockEvents',(select count(*) from giveaway_stock_events where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs))),
  'claimEvents',(select count(*) from giveaway_claim_events where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs) or registration_id=any(v_regs))));
 return jsonb_build_object('backup',v_backup,'fingerprint',encode(sha256(convert_to(v_backup::text,'UTF8')),'hex'),'summary',v_summary,
  'mode',p_mode,'runIds',to_jsonb(v_runs),'registrationIds',to_jsonb(v_regs),'checkinIds',to_jsonb(v_se),
  'confirmation',case when p_mode='clean' then 'CLEAN SLATE' else 'DELETE SELECTED RUNS' end,
  'runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'day',operating_day,'number',run_number,'status',status,'reason',reset_reason) order by operating_day desc,run_number desc) from queue_runs where instance_id=p_instance_id),'[]'::jsonb));
end $$;

create or replace function public.tdqsys_cleanup_apply(p_instance_id text,p_mode text,p_run_ids uuid[],p_fingerprint text,p_confirmation text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_preview jsonb;v_runs uuid[];v_regs uuid[];v_se uuid[];v_master uuid[];v_receipt tdqsys_cleanup_receipts%rowtype;v_new queue_runs;v_zone text;v_result jsonb;
begin
 select * into v_receipt from tdqsys_cleanup_receipts where instance_id=p_instance_id and request_id=p_request_id;
 if found then
  if v_receipt.mode<>p_mode or v_receipt.backup_hash<>p_fingerprint or v_receipt.run_ids<>coalesce(p_run_ids,'{}'::uuid[]) then raise exception 'cleanup request ID already used for different scope';end if;
  return v_receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_request_id is null or p_confirmation is distinct from (case when p_mode='clean' then 'CLEAN SLATE' else 'DELETE SELECTED RUNS' end) then raise exception 'type the exact cleanup confirmation';end if;
 -- Never wait while holding a lock needed by another writer. An occupied booth
 -- must retry after a fresh backup instead of deleting unexported arrivals.
 lock table registrations,sales_executives,se_daily_checkins,test_drive_entries,print_jobs,sheet_sync_jobs,queue_runs,queue_counters,queue_model_display,display_state,audit_log,tdqsys_local_operation_receipts,giveaway_stock_events,giveaway_claim_events,registration_giveaways,giveaway_issue_requests in share row exclusive mode nowait;
 if not pg_try_advisory_xact_lock(hashtextextended(p_instance_id,0)) or not pg_try_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0)) then raise exception 'location is busy; refresh preview and backup before cleanup';end if;
 v_preview:=tdqsys_cleanup_preview(p_instance_id,p_mode,p_run_ids);
 if v_preview->>'fingerprint' is distinct from p_fingerprint then raise exception 'data changed since backup; refresh preview and export a new backup';end if;
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_runs from jsonb_array_elements_text(v_preview->'runIds');
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_regs from jsonb_array_elements_text(v_preview->'registrationIds');
 select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_se from jsonb_array_elements_text(v_preview->'checkinIds');
 select coalesce(array_agg(distinct sales_executive_id),'{}'::uuid[]) into v_master from se_daily_checkins where id=any(v_se);
 update display_state set active_test_drive_entry_id=null where instance_id=p_instance_id and active_test_drive_entry_id in(select id from test_drive_entries where queue_run_id=any(v_runs));
 update display_state set queue_run_id=null where instance_id=p_instance_id and queue_run_id=any(v_runs);
 update test_drive_entries set replaced_entry_id=null where instance_id=p_instance_id and replaced_entry_id in(select id from test_drive_entries where queue_run_id=any(v_runs));
 delete from print_jobs where instance_id=p_instance_id and (p_mode='clean' or test_drive_entry_id in(select id from test_drive_entries where queue_run_id=any(v_runs)) or se_daily_checkin_id=any(v_se));
 delete from giveaway_issue_requests where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs) or registration_id=any(v_regs));
 delete from registration_giveaways where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs) or registration_id=any(v_regs));
 delete from giveaway_claim_events where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs) or registration_id=any(v_regs));
 delete from giveaway_stock_events where instance_id=p_instance_id and (p_mode='clean' or queue_run_id=any(v_runs));
 delete from tdqsys_local_operation_receipts where instance_id=p_instance_id and queue_run_id=any(v_runs);
 delete from test_drive_entries where instance_id=p_instance_id and queue_run_id=any(v_runs);
 delete from registrations where instance_id=p_instance_id and id=any(v_regs);
 delete from se_daily_checkins where instance_id=p_instance_id and id=any(v_se);
 delete from sales_executives s where s.instance_id=p_instance_id and (p_mode='clean' or s.id=any(v_master)) and not exists(select 1 from se_daily_checkins c where c.sales_executive_id=s.id);
 delete from queue_model_display where queue_run_id=any(v_runs);
 delete from queue_counters where queue_run_id=any(v_runs);
 delete from audit_log where instance_id=p_instance_id and (p_mode='clean' or target_id=any(v_runs::text[]) or target_id=any(v_regs::text[]) or target_id=any(v_se::text[]));
 delete from queue_runs where instance_id=p_instance_id and id=any(v_runs);
 if p_mode='clean' then
  select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
  select * into v_new from tdqsys_open_queue_run(p_instance_id,(now() at time zone coalesce(v_zone,'Asia/Manila'))::date,'clean_slate','desktop');
 end if;
 v_result:=jsonb_build_object('instanceId',p_instance_id,'deleted',true,'mode',p_mode,'deletedRunIds',v_preview->'runIds','summary',v_preview->'summary','newRunId',v_new.id,'replayed',false);
 insert into tdqsys_cleanup_receipts values(p_instance_id,p_request_id,p_fingerprint,p_mode,coalesce(p_run_ids,'{}'::uuid[]),v_result);
 return v_result;
end $$;
revoke all on function public.tdqsys_preserve_deleted_se_code(),public.tdqsys_event_backup(text),public.tdqsys_cleanup_preview(text,text,uuid[]),public.tdqsys_cleanup_apply(text,text,uuid[],text,text,uuid) from public,anon,authenticated;
grant execute on function public.tdqsys_preserve_deleted_se_code(),public.tdqsys_event_backup(text),public.tdqsys_cleanup_preview(text,text,uuid[]),public.tdqsys_cleanup_apply(text,text,uuid[],text,text,uuid) to service_role;
commit;
