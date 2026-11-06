begin;
alter table public.queue_runs add column if not exists giveaway_reset boolean not null default false;
create or replace function public.tdqsys_stamp_run_boundary() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then new.opened_at:=clock_timestamp();new.giveaway_reset:=true;
 elsif new.status='closed' and old.status<>'closed' then new.closed_at:=clock_timestamp();end if;
 return new;
end $$;
alter table public.registration_giveaways add column if not exists queue_run_id uuid references public.queue_runs(id);
update public.registration_giveaways g set queue_run_id=coalesce(
 (select q.id from queue_runs q where q.instance_id=g.instance_id and q.opened_at<=g.issued_at and (q.closed_at is null or q.closed_at>g.issued_at) order by q.opened_at desc limit 1),
 (select e.queue_run_id from test_drive_entries e where e.registration_id=g.registration_id order by e.issued_at limit 1))
where queue_run_id is null;
alter table public.registration_giveaways alter column queue_run_id set not null;
alter table public.registration_giveaways drop constraint if exists registration_giveaways_pkey;
alter table public.registration_giveaways add primary key(registration_id,queue_run_id,item);
drop index if exists public.registration_giveaway_distinct_item;
create unique index registration_giveaway_distinct_item on public.registration_giveaways(registration_id,queue_run_id,lower(item));
drop index if exists public.giveaway_one_opening;
create unique index giveaway_one_opening on public.giveaway_stock_events(queue_run_id,item) where kind='opening';
alter table public.giveaway_issue_requests add column if not exists queue_run_id uuid references public.queue_runs(id);
update public.giveaway_issue_requests r set queue_run_id=coalesce(
 (select q.id from queue_runs q where q.instance_id=r.instance_id and q.opened_at<=r.created_at and (q.closed_at is null or q.closed_at>r.created_at) order by q.opened_at desc limit 1),
 (select e.queue_run_id from test_drive_entries e where e.registration_id=r.registration_id order by e.issued_at limit 1))
where queue_run_id is null;
do $$ begin
 if to_regprocedure('public.tdqsys_inventory_legacy(text,timestamp with time zone)') is null then
 alter function public.tdqsys_inventory_snapshot(text,timestamptz) rename to tdqsys_inventory_legacy;
 end if;
end $$;
create or replace function public.tdqsys_inventory_snapshot(p_instance_id text,p_cutoff timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_run uuid;v_scoped boolean;v_result jsonb;
begin
 if p_cutoff is null then select id,giveaway_reset into v_run,v_scoped from queue_runs where instance_id=p_instance_id and status='active';
 else select id,giveaway_reset into v_run,v_scoped from queue_runs where instance_id=p_instance_id and closed_at=p_cutoff limit 1;end if;
 if not coalesce(v_scoped,false) then return tdqsys_inventory_legacy(p_instance_id,p_cutoff);end if;
 with names as (
 select value item from test_drive_settings,jsonb_array_elements_text(giveaway_items) where instance_id=p_instance_id and p_cutoff is null
 union select item from giveaway_stock_events where instance_id=p_instance_id and queue_run_id=v_run
 union select item from giveaway_claim_events where instance_id=p_instance_id and queue_run_id=v_run
 ), totals as (
 select n.item,
 coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and queue_run_id=v_run and item=n.item and kind='opening'),0) opening,
 exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and queue_run_id=v_run and item=n.item and kind='opening') initialized,
 coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and queue_run_id=v_run and item=n.item),0) supplied,
 coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and queue_run_id=v_run and item=n.item),0) consumed from names n)
 select coalesce(jsonb_agg(jsonb_build_object('item',item,'opening',opening,'initialized',initialized,'supplied',supplied,'given',consumed,'remaining',supplied-consumed) order by item),'[]'::jsonb) into v_result from totals;
 return v_result;
end $$;

create or replace function public.tdqsys_add_giveaway_stock(p_instance_id text,p_item text,p_quantity integer,p_kind text,p_request_id uuid,p_expected_run uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing giveaway_stock_events%rowtype; v_run uuid; v_id uuid; v_scoped boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 if p_expected_run is distinct from v_run then raise exception 'queue run changed; refresh stock setup'; end if;
 select giveaway_reset into v_scoped from queue_runs where id=v_run;
 select * into v_existing from giveaway_stock_events where instance_id=p_instance_id and request_id=p_request_id;
 if found then
  if v_existing.queue_run_id is distinct from v_run then raise exception 'stock request belongs to an earlier run'; end if;
  if v_existing.item is distinct from p_item or v_existing.quantity is distinct from p_quantity or v_existing.kind is distinct from p_kind then raise exception 'stock request was already used for different values'; end if;
  return jsonb_build_object('saved',true,'replayed',true,'eventId',v_existing.id);
 end if;
 if p_request_id is null or p_quantity is null or p_quantity<0 or p_quantity>100000000 or p_kind not in ('opening','replenishment') or p_kind is null or (p_kind='replenishment' and p_quantity=0) then raise exception 'enter a valid stock quantity'; end if;
 if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=p_item) then raise exception 'save this giveaway item in Settings first'; end if;
 if p_kind='opening' and exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=p_item and kind='opening' and (not v_scoped or queue_run_id=v_run)) then raise exception 'opening balance is already recorded; use + to replenish'; end if;
 if p_kind='replenishment' and not exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=p_item and kind='opening' and (not v_scoped or queue_run_id=v_run)) then raise exception 'save an opening balance first'; end if;
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
 insert into giveaway_stock_events(instance_id,item,kind,quantity,request_id,queue_run_id) values(p_instance_id,p_item,p_kind,p_quantity,p_request_id,v_run) returning id into v_id;
 return jsonb_build_object('saved',true,'replayed',false,'eventId',v_id);
end $$;
create or replace function public.tdqsys_issue_giveaways(p_instance_id text,p_registration_id uuid,p_items jsonb,p_request_id uuid,p_expected_run uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_items jsonb; v_item text; v_receipt giveaway_issue_requests%rowtype; v_remaining bigint; v_run uuid; v_time timestamptz; v_result jsonb; v_scoped boolean;
begin
 if p_request_id is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'select giveaway items'; end if;
 if jsonb_array_length(p_items) not between 1 and 200 or exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 160) then raise exception 'invalid giveaway item list'; end if;
 if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_items))<>jsonb_array_length(p_items) then raise exception 'select each giveaway item only once'; end if;
 select jsonb_agg(btrim(value) order by btrim(value)) into v_items from jsonb_array_elements_text(p_items);
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 if p_expected_run is distinct from v_run then raise exception 'queue run changed; refresh before dispensing'; end if;
 select giveaway_reset into v_scoped from queue_runs where id=v_run;
 perform 1 from registrations where id=p_registration_id and instance_id=p_instance_id for update;
 if not found then raise exception 'registration not found for this location'; end if;
 select * into v_receipt from giveaway_issue_requests where instance_id=p_instance_id and request_id=p_request_id;
 if found then
  if v_receipt.queue_run_id is distinct from v_run then raise exception 'giveaway request belongs to an earlier run'; end if;
  if v_receipt.registration_id<>p_registration_id or v_receipt.items<>v_items then raise exception 'giveaway request was already used for different values'; end if;
  return v_receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Validate the entire batch before recording any item.
 for v_item in select value from jsonb_array_elements_text(v_items) loop
  if exists(select 1 from registration_giveaways where registration_id=p_registration_id and lower(item)=lower(v_item) and (not v_scoped or queue_run_id=v_run)) then raise exception 'a selected item was already issued; refresh before dispensing'; end if;
  if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=v_item) then raise exception 'select configured giveaway items'; end if;
  select coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=v_item and (not v_scoped or queue_run_id=v_run)),0)
   -coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=v_item and (not v_scoped or queue_run_id=v_run)),0) into v_remaining;
  if v_remaining<=0 then raise exception 'a selected item is out of stock; no items were issued'; end if;
 end loop;
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
 v_time:=clock_timestamp();
 for v_item in select value from jsonb_array_elements_text(v_items) loop
  insert into registration_giveaways(registration_id,instance_id,item,issued_at,queue_run_id) values(p_registration_id,p_instance_id,v_item,v_time,v_run);
  insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,source,created_at) values(p_instance_id,p_registration_id,v_item,1,v_run,'multi-selection',v_time);
 end loop;
 -- Retain a first-item scalar for older read-only clients, never overwrite raw form snapshots.
 update registrations set giveaway_item=coalesce(giveaway_item,v_items->>0),giveaway_updated_at=v_time where id=p_registration_id;
 select jsonb_build_object('runId',v_run,'registrationId',p_registration_id,'issuedItems',v_items,'giveawayClaims',jsonb_agg(item order by issued_at,item),'replayed',false)
 into v_result from registration_giveaways where registration_id=p_registration_id and (not v_scoped or queue_run_id=v_run);
 insert into giveaway_issue_requests(instance_id,request_id,registration_id,items,result,queue_run_id) values(p_instance_id,p_request_id,p_registration_id,v_items,v_result,v_run);
 return v_result;
end $$;
create or replace function public.tdqsys_giveaway_snapshot(p_instance_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_zone text; v_day date; v_rows jsonb; v_run uuid; v_scoped boolean;
begin
 select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
 v_zone:=coalesce(v_zone,'Asia/Manila');v_day:=(now() at time zone v_zone)::date;
 select id,giveaway_reset into v_run,v_scoped from queue_runs where instance_id=p_instance_id and status='active';
 select coalesce(jsonb_agg(coalesce(j.payload_snapshot,jsonb_build_object('submittedAt',r.submitted_at,'fullName',r.full_name,'email',r.email,
  'cityAddress',r.city_address,'contactNumber',r.contact_number,'forApplication',r.for_application,'forReservation',r.for_reservation))
  ||jsonb_build_object('registrationId',r.id,'giveawayItem',(select item from registration_giveaways where registration_id=r.id and (not coalesce(v_scoped,false) or queue_run_id=v_run) order by issued_at,item limit 1),'giveawayUpdatedAt',r.giveaway_updated_at,
   'giveawayClaims',coalesce((select jsonb_agg(item order by issued_at,item) from registration_giveaways where registration_id=r.id and (not coalesce(v_scoped,false) or queue_run_id=v_run)),'[]'::jsonb))
  order by r.submitted_at,r.id),'[]'::jsonb) into v_rows
 from registrations r left join sheet_sync_jobs j on j.registration_id=r.id where r.instance_id=p_instance_id and (r.submitted_at at time zone v_zone)::date=v_day;
 return jsonb_build_object('instanceId',p_instance_id,'runId',v_run,'giveawayReset',coalesce(v_scoped,false),'day',v_day,'timezone',v_zone,'registrations',v_rows,'inventory',tdqsys_inventory_snapshot(p_instance_id),
  'giveawayItems',coalesce((select giveaway_items from test_drive_settings where instance_id=p_instance_id),'[]'::jsonb));
end $$;
create or replace function public.tdqsys_dashboard_legacy(p_instance_id text,p_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_run queue_runs%rowtype; v_end timestamptz; v_models jsonb; v_stock jsonb; v_runs jsonb; v_registered bigint; v_queued bigint; v_tickets bigint; v_given bigint; v_returned bigint;
begin
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',operating_day,'number',run_number,'status',status) order by operating_day desc,run_number desc),'[]'::jsonb) into v_runs from queue_runs where instance_id=p_instance_id;
 if p_run_id is null then select * into v_run from queue_runs where instance_id=p_instance_id order by (status='active') desc,opened_at desc limit 1;
 else select * into v_run from queue_runs where instance_id=p_instance_id and id=p_run_id;
  if not found then raise exception 'queue run not found for this location'; end if;
 end if;
 if v_run.id is null then return jsonb_build_object('runs',v_runs,'run',null,'models','[]'::jsonb,'inventory',tdqsys_inventory_snapshot(p_instance_id)); end if;
 v_end:=case when v_run.status='closed' then v_run.closed_at else null end;
 -- Attribute each form submission once to its first ticket run, even when
 -- the run was opened inside that same registration transaction.
 select count(*) into v_registered from registrations r where r.instance_id=p_instance_id and
  (select e.queue_run_id from test_drive_entries e join queue_runs q on q.id=e.queue_run_id
   where e.registration_id=r.id order by q.opened_at,e.issued_at,e.id limit 1)=v_run.id;
 select count(distinct registration_id),count(*) into v_queued,v_tickets from test_drive_entries where instance_id=p_instance_id and queue_run_id=v_run.id;
 select coalesce(jsonb_agg(jsonb_build_object('model',m.full_name,'registered',
   (select count(distinct registration_id) from test_drive_entries where instance_id=p_instance_id and queue_run_id=v_run.id and vehicle_model_id=m.id),
   'tickets',(select count(*) from test_drive_entries where instance_id=p_instance_id and queue_run_id=v_run.id and vehicle_model_id=m.id),
   'done',(select count(*) from test_drive_entries where instance_id=p_instance_id and queue_run_id=v_run.id and vehicle_model_id=m.id and status='done'),
   'noShow',(select count(*) from test_drive_entries where instance_id=p_instance_id and queue_run_id=v_run.id and vehicle_model_id=m.id and status='no_show')) order by m.full_name),'[]'::jsonb)
 into v_models from vehicle_models m where m.instance_id=p_instance_id and ((v_run.status='active' and m.active) or exists(select 1 from test_drive_entries where queue_run_id=v_run.id and vehicle_model_id=m.id));
 select coalesce(sum(quantity) filter(where quantity>0),0),-coalesce(sum(quantity) filter(where quantity<0),0) into v_given,v_returned from giveaway_claim_events where instance_id=p_instance_id and queue_run_id=v_run.id;
 select coalesce(jsonb_agg(value||jsonb_build_object('beginning',
   coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=value->>'item' and created_at<v_run.opened_at),0)
   -coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=value->>'item' and created_at<v_run.opened_at),0),
   'added',coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=value->>'item' and created_at>=v_run.opened_at and (v_end is null or created_at<v_end)),0),
   'issued',coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=value->>'item' and queue_run_id=v_run.id and quantity>0),0),
   'returned',-coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=value->>'item' and queue_run_id=v_run.id and quantity<0),0))),'[]'::jsonb)
 into v_stock from jsonb_array_elements(tdqsys_inventory_snapshot(p_instance_id,v_end));
 return jsonb_build_object('runs',v_runs,'run',to_jsonb(v_run),'registered',v_registered,'queuedClients',v_queued,'tickets',v_tickets,
  'given',v_given,'returned',v_returned,'netGiven',v_given-v_returned,'models',v_models,'inventory',v_stock,'asOf',coalesce(v_end,clock_timestamp()));
end $$;

create or replace function public.tdqsys_add_giveaway_stock(p_instance_id text,p_item text,p_quantity integer,p_kind text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run uuid;
begin
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active' and not giveaway_reset;
 if v_run is null then raise exception 'refresh using the updated app for run-scoped stock';end if;
 return tdqsys_add_giveaway_stock(p_instance_id,p_item,p_quantity,p_kind,p_request_id,v_run);
end $$;
create or replace function public.tdqsys_configure_inventory(p_instance_id text,p_items jsonb,p_openings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare entry jsonb;v_run uuid;v_scoped boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 v_run:=tdqsys_ensure_daily_run(p_instance_id);
 select giveaway_reset into v_scoped from queue_runs where id=v_run;
 perform tdqsys_configure_giveaways(p_instance_id,p_items);
 if p_openings is null or jsonb_typeof(p_openings)<>'array' or jsonb_array_length(p_openings)>200 then raise exception 'invalid opening balance list';end if;
 for entry in select value from jsonb_array_elements(p_openings) loop
 if v_scoped and (entry->>'runId')::uuid is distinct from v_run then continue;end if;
 if entry ? 'runId' and (entry->>'runId')::uuid is distinct from v_run then continue;end if;
 if exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=entry->>'item' and kind='opening' and (not v_scoped or queue_run_id=v_run)) then continue;end if;
 if jsonb_typeof(entry->'quantity')<>'number' or (entry->>'quantity')!~'^[0-9]+$' then raise exception 'invalid opening quantity';end if;
 perform tdqsys_add_giveaway_stock(p_instance_id,entry->>'item',(entry->>'quantity')::int,'opening',(entry->>'requestId')::uuid,v_run);
 end loop;
end $$;
create or replace function public.tdqsys_issue_giveaways(p_instance_id text,p_registration_id uuid,p_items jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_run uuid;
begin
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active' and not giveaway_reset;
 if v_run is null then raise exception 'queue run changed; use the updated app and refresh';end if;
 return tdqsys_issue_giveaways(p_instance_id,p_registration_id,p_items,p_request_id,v_run);
end $$;
create or replace function public.tdqsys_giveaway_stock_history(p_instance_id text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('runId',(select id from queue_runs where instance_id=p_instance_id and status='active'),
 'inventory',tdqsys_inventory_snapshot(p_instance_id),
 'history',coalesce((select jsonb_agg(to_jsonb(e) order by created_at desc,id desc) from giveaway_stock_events e where instance_id=p_instance_id),'[]'::jsonb));
$$;
create or replace function public.tdqsys_dashboard_snapshot(p_instance_id text,p_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb;v_stock jsonb;
begin
 v:=tdqsys_dashboard_legacy(p_instance_id,p_run_id);
 if coalesce((v->'run'->>'giveaway_reset')::boolean,false) then
 select coalesce(jsonb_agg(value||jsonb_build_object('beginning',0)),'[]'::jsonb) into v_stock from jsonb_array_elements(v->'inventory');
 v:=jsonb_set(v,'{inventory}',v_stock);
 end if;
 return v;
end $$;
revoke all on function public.tdqsys_inventory_snapshot(text,timestamptz),public.tdqsys_dashboard_legacy(text,uuid),public.tdqsys_add_giveaway_stock(text,text,int,text,uuid,uuid),public.tdqsys_issue_giveaways(text,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tdqsys_inventory_snapshot(text,timestamptz),public.tdqsys_dashboard_legacy(text,uuid),public.tdqsys_add_giveaway_stock(text,text,int,text,uuid,uuid),public.tdqsys_issue_giveaways(text,uuid,jsonb,uuid,uuid) to service_role;
commit;
