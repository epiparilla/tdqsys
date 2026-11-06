begin;
create table if not exists public.giveaway_stock_events (
 id uuid primary key default gen_random_uuid(), instance_id text not null,
 item text not null check(length(btrim(item)) between 1 and 160),
 kind text not null check(kind in ('opening','replenishment')),
 quantity integer not null check(quantity between 0 and 100000000 and (kind='opening' or quantity>0)),
 request_id uuid not null, queue_run_id uuid references public.queue_runs(id),
 created_at timestamptz not null default clock_timestamp(), unique(instance_id,request_id)
);
create unique index if not exists giveaway_one_opening on public.giveaway_stock_events(instance_id,item) where kind='opening';
create index if not exists giveaway_stock_location_time on public.giveaway_stock_events(instance_id,created_at);
create table if not exists public.giveaway_claim_events (
 id uuid primary key default gen_random_uuid(), instance_id text not null,
 registration_id uuid not null references public.registrations(id), item text not null,
 quantity integer not null check(quantity in (-1,1)), queue_run_id uuid references public.queue_runs(id),
 source text not null default 'selection', created_at timestamptz not null default clock_timestamp()
);
create unique index if not exists giveaway_legacy_claim on public.giveaway_claim_events(registration_id) where source='legacy';
create index if not exists giveaway_claim_location_time on public.giveaway_claim_events(instance_id,created_at);
create index if not exists giveaway_stock_item_time on public.giveaway_stock_events(instance_id,item,created_at);
create index if not exists giveaway_claim_item_time on public.giveaway_claim_events(instance_id,item,created_at);
create index if not exists giveaway_claim_run_item on public.giveaway_claim_events(instance_id,queue_run_id,item);
create index if not exists registrations_location_submitted on public.registrations(instance_id,submitted_at);
alter table public.giveaway_stock_events enable row level security;
alter table public.giveaway_claim_events enable row level security;
revoke all on public.giveaway_stock_events,public.giveaway_claim_events from public,anon,authenticated;
grant all on public.giveaway_stock_events,public.giveaway_claim_events to service_role;

-- Use actual boundary time, not a transaction's earlier NOW(), after waiting
-- for concurrent work. Existing runs are unchanged; future resets retain stock
-- operations committed before close and exclude later ones.
create or replace function public.tdqsys_stamp_run_boundary()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then new.opened_at:=clock_timestamp();
 elsif new.status='closed' and old.status<>'closed' then new.closed_at:=clock_timestamp(); end if;
 return new;
end $$;
create or replace trigger tdqsys_run_boundary_clock before insert or update on public.queue_runs for each row execute function public.tdqsys_stamp_run_boundary();
revoke all on function public.tdqsys_stamp_run_boundary() from public,anon,authenticated;
grant execute on function public.tdqsys_stamp_run_boundary() to service_role;

-- Preserve existing claims without inventing opening stock or dispensing twice.
insert into public.giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,source,created_at)
select r.instance_id,r.id,r.giveaway_item,1,
 (select q.id from public.queue_runs q where q.instance_id=r.instance_id
  and q.opened_at<=coalesce(r.giveaway_updated_at,r.submitted_at)
  and (q.closed_at is null or q.closed_at>coalesce(r.giveaway_updated_at,r.submitted_at)) order by q.opened_at desc limit 1),
 'legacy',coalesce(r.giveaway_updated_at,r.submitted_at)
from public.registrations r where r.giveaway_item is not null
and not exists(select 1 from public.giveaway_claim_events e where e.registration_id=r.id);

create or replace function public.tdqsys_inventory_snapshot(p_instance_id text,p_cutoff timestamptz default null)
returns jsonb language sql stable security definer set search_path=public as $$
 with names as (
  select value item from test_drive_settings,jsonb_array_elements_text(giveaway_items) where instance_id=p_instance_id and p_cutoff is null
  union select item from giveaway_stock_events where instance_id=p_instance_id and (p_cutoff is null or created_at<p_cutoff)
  union select item from giveaway_claim_events where instance_id=p_instance_id and (p_cutoff is null or created_at<p_cutoff)
 ), totals as (
  select n.item,
   coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=n.item and kind='opening' and (p_cutoff is null or created_at<p_cutoff)),0) opening,
   exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=n.item and kind='opening' and (p_cutoff is null or created_at<p_cutoff)) initialized,
   coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=n.item and (p_cutoff is null or created_at<p_cutoff)),0) supplied,
   coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=n.item and (p_cutoff is null or created_at<p_cutoff)),0) consumed
  from names n
 ) select coalesce(jsonb_agg(jsonb_build_object('item',item,'opening',opening,'initialized',initialized,'supplied',supplied,'given',consumed,'remaining',supplied-consumed) order by item),'[]'::jsonb) from totals;
$$;

create or replace function public.tdqsys_add_giveaway_stock(p_instance_id text,p_item text,p_quantity integer,p_kind text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_existing giveaway_stock_events%rowtype; v_run uuid; v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 select * into v_existing from giveaway_stock_events where instance_id=p_instance_id and request_id=p_request_id;
 if found then
  if v_existing.item is distinct from p_item or v_existing.quantity is distinct from p_quantity or v_existing.kind is distinct from p_kind then raise exception 'stock request was already used for different values'; end if;
  return jsonb_build_object('saved',true,'replayed',true,'eventId',v_existing.id);
 end if;
 if p_request_id is null or p_quantity is null or p_quantity<0 or p_quantity>100000000 or p_kind not in ('opening','replenishment') or p_kind is null or (p_kind='replenishment' and p_quantity=0) then raise exception 'enter a valid stock quantity'; end if;
 if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=p_item) then raise exception 'save this giveaway item in Settings first'; end if;
 if p_kind='opening' and exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=p_item and kind='opening') then raise exception 'opening balance is already recorded; use + to replenish'; end if;
 if p_kind='replenishment' and not exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=p_item and kind='opening') then raise exception 'save an opening balance first'; end if;
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
 insert into giveaway_stock_events(instance_id,item,kind,quantity,request_id,queue_run_id) values(p_instance_id,p_item,p_kind,p_quantity,p_request_id,v_run) returning id into v_id;
 return jsonb_build_object('saved',true,'replayed',false,'eventId',v_id);
end $$;

create or replace function public.tdqsys_configure_inventory(p_instance_id text,p_items jsonb,p_openings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare entry jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 perform tdqsys_configure_giveaways(p_instance_id,p_items);
 if p_openings is null or jsonb_typeof(p_openings)<>'array' or jsonb_array_length(p_openings)>200 then raise exception 'invalid opening balance list'; end if;
 for entry in select value from jsonb_array_elements(p_openings) loop
  if jsonb_typeof(entry->'quantity')<>'number' or (entry->>'quantity') !~ '^[0-9]+$' then raise exception 'invalid opening balance quantity'; end if;
  if exists(select 1 from giveaway_stock_events where instance_id=p_instance_id and item=entry->>'item' and kind='opening') then continue; end if;
  perform tdqsys_add_giveaway_stock(p_instance_id,entry->>'item',(entry->>'quantity')::integer,'opening',(entry->>'requestId')::uuid);
 end loop;
end $$;

create or replace function public.tdqsys_giveaway_stock_history(p_instance_id text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('inventory',tdqsys_inventory_snapshot(p_instance_id),
 'history',coalesce((select jsonb_agg(to_jsonb(e) order by created_at desc,id desc) from giveaway_stock_events e where instance_id=p_instance_id),'[]'::jsonb));
$$;

create or replace function public.tdqsys_set_giveaway(p_instance_id text,p_registration_id uuid,p_item text,p_expected_item text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old text; v_item text:=nullif(btrim(p_item),''); v_time timestamptz:=clock_timestamp(); v_run uuid; v_remaining bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 select giveaway_item into v_old from registrations where id=p_registration_id and instance_id=p_instance_id for update;
 if not found then raise exception 'registration not found for this location'; end if;
 if v_old is distinct from p_expected_item then raise exception 'giveaway selection changed; refresh before dispensing'; end if;
 if v_item is not null and not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=v_item) then raise exception 'select a configured giveaway item'; end if;
 if v_item is not distinct from v_old then return jsonb_build_object('registrationId',p_registration_id,'giveawayItem',v_old); end if;
 if v_item is not null then
  select coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=v_item),0)
   -coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=v_item),0) into v_remaining;
  if v_remaining<=0 then raise exception 'giveaway item is out of stock; replenish in Settings'; end if;
 end if;
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
 if v_old is not null then insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,created_at) values(p_instance_id,p_registration_id,v_old,-1,v_run,v_time); end if;
 if v_item is not null then insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,created_at) values(p_instance_id,p_registration_id,v_item,1,v_run,v_time); end if;
 update registrations set giveaway_item=v_item,giveaway_updated_at=v_time where id=p_registration_id;
 return jsonb_build_object('registrationId',p_registration_id,'giveawayItem',v_item,'giveawayUpdatedAt',v_time);
end $$;

create or replace function public.tdqsys_dashboard_snapshot(p_instance_id text,p_run_id uuid default null)
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

revoke all on function public.tdqsys_inventory_snapshot(text,timestamptz),public.tdqsys_add_giveaway_stock(text,text,integer,text,uuid),public.tdqsys_configure_inventory(text,jsonb,jsonb),public.tdqsys_giveaway_stock_history(text),public.tdqsys_dashboard_snapshot(text,uuid),public.tdqsys_set_giveaway(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tdqsys_inventory_snapshot(text,timestamptz),public.tdqsys_add_giveaway_stock(text,text,integer,text,uuid),public.tdqsys_configure_inventory(text,jsonb,jsonb),public.tdqsys_giveaway_stock_history(text),public.tdqsys_dashboard_snapshot(text,uuid),public.tdqsys_set_giveaway(text,uuid,text,text) to service_role;
commit;
