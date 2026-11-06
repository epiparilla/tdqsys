begin;
create table if not exists public.registration_giveaways (
 registration_id uuid not null references public.registrations(id), instance_id text not null,
 item text not null check(length(btrim(item)) between 1 and 160), issued_at timestamptz not null default clock_timestamp(),
 primary key(registration_id,item)
);
create unique index if not exists registration_giveaway_distinct_item on public.registration_giveaways(registration_id,lower(item));
create index if not exists registration_giveaway_location on public.registration_giveaways(instance_id,registration_id);
create table if not exists public.giveaway_issue_requests (
 instance_id text not null,request_id uuid not null,registration_id uuid not null references public.registrations(id),
 items jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(instance_id,request_id)
);
alter table public.registration_giveaways enable row level security;
alter table public.giveaway_issue_requests enable row level security;
revoke all on public.registration_giveaways,public.giveaway_issue_requests from public,anon,authenticated;
grant all on public.registration_giveaways,public.giveaway_issue_requests to service_role;

-- Current legacy selections already have stock ledger entries; do not deduct again.
insert into registration_giveaways(registration_id,instance_id,item,issued_at)
select id,instance_id,giveaway_item,coalesce(giveaway_updated_at,submitted_at) from registrations where giveaway_item is not null
on conflict do nothing;

create or replace function public.tdqsys_issue_giveaways(p_instance_id text,p_registration_id uuid,p_items jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_items jsonb; v_item text; v_receipt giveaway_issue_requests%rowtype; v_remaining bigint; v_run uuid; v_time timestamptz; v_result jsonb;
begin
 if p_request_id is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'select giveaway items'; end if;
 if jsonb_array_length(p_items) not between 1 and 200 or exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 160) then raise exception 'invalid giveaway item list'; end if;
 if (select count(distinct lower(btrim(value))) from jsonb_array_elements_text(p_items))<>jsonb_array_length(p_items) then raise exception 'select each giveaway item only once'; end if;
 select jsonb_agg(btrim(value) order by btrim(value)) into v_items from jsonb_array_elements_text(p_items);
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 perform 1 from registrations where id=p_registration_id and instance_id=p_instance_id for update;
 if not found then raise exception 'registration not found for this location'; end if;
 select * into v_receipt from giveaway_issue_requests where instance_id=p_instance_id and request_id=p_request_id;
 if found then
  if v_receipt.registration_id<>p_registration_id or v_receipt.items<>v_items then raise exception 'giveaway request was already used for different values'; end if;
  return v_receipt.result||jsonb_build_object('replayed',true);
 end if;
 -- Validate the entire batch before recording any item.
 for v_item in select value from jsonb_array_elements_text(v_items) loop
  if exists(select 1 from registration_giveaways where registration_id=p_registration_id and lower(item)=lower(v_item)) then raise exception 'a selected item was already issued; refresh before dispensing'; end if;
  if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=v_item) then raise exception 'select configured giveaway items'; end if;
  select coalesce((select sum(quantity) from giveaway_stock_events where instance_id=p_instance_id and item=v_item),0)
   -coalesce((select sum(quantity) from giveaway_claim_events where instance_id=p_instance_id and item=v_item),0) into v_remaining;
  if v_remaining<=0 then raise exception 'a selected item is out of stock; no items were issued'; end if;
 end loop;
 select id into v_run from queue_runs where instance_id=p_instance_id and status='active';
 v_time:=clock_timestamp();
 for v_item in select value from jsonb_array_elements_text(v_items) loop
  insert into registration_giveaways(registration_id,instance_id,item,issued_at) values(p_registration_id,p_instance_id,v_item,v_time);
  insert into giveaway_claim_events(instance_id,registration_id,item,quantity,queue_run_id,source,created_at) values(p_instance_id,p_registration_id,v_item,1,v_run,'multi-selection',v_time);
 end loop;
 -- Retain a first-item scalar for older read-only clients, never overwrite raw form snapshots.
 update registrations set giveaway_item=coalesce(giveaway_item,v_items->>0),giveaway_updated_at=v_time where id=p_registration_id;
 select jsonb_build_object('registrationId',p_registration_id,'issuedItems',v_items,'giveawayClaims',jsonb_agg(item order by issued_at,item),'replayed',false)
 into v_result from registration_giveaways where registration_id=p_registration_id;
 insert into giveaway_issue_requests(instance_id,request_id,registration_id,items,result) values(p_instance_id,p_request_id,p_registration_id,v_items,v_result);
 return v_result;
end $$;

create or replace function public.tdqsys_giveaway_snapshot(p_instance_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_zone text; v_day date; v_rows jsonb;
begin
 select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
 v_zone:=coalesce(v_zone,'Asia/Manila');v_day:=(now() at time zone v_zone)::date;
 select coalesce(jsonb_agg(coalesce(j.payload_snapshot,jsonb_build_object('submittedAt',r.submitted_at,'fullName',r.full_name,'email',r.email,
  'cityAddress',r.city_address,'contactNumber',r.contact_number,'forApplication',r.for_application,'forReservation',r.for_reservation))
  ||jsonb_build_object('registrationId',r.id,'giveawayItem',r.giveaway_item,'giveawayUpdatedAt',r.giveaway_updated_at,
   'giveawayClaims',coalesce((select jsonb_agg(item order by issued_at,item) from registration_giveaways where registration_id=r.id),'[]'::jsonb))
  order by r.submitted_at,r.id),'[]'::jsonb) into v_rows
 from registrations r left join sheet_sync_jobs j on j.registration_id=r.id where r.instance_id=p_instance_id and (r.submitted_at at time zone v_zone)::date=v_day;
 return jsonb_build_object('instanceId',p_instance_id,'day',v_day,'timezone',v_zone,'registrations',v_rows,'inventory',tdqsys_inventory_snapshot(p_instance_id),
  'giveawayItems',coalesce((select giveaway_items from test_drive_settings where instance_id=p_instance_id),'[]'::jsonb));
end $$;

-- Older apps may issue a first item, but cannot clear/replace locked claims.
create or replace function public.tdqsys_set_giveaway(p_instance_id text,p_registration_id uuid,p_item text,p_expected_item text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old text; v_item text:=nullif(btrim(p_item),''); v_result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_instance_id||':giveaway-stock',0));
 select giveaway_item into v_old from registrations where id=p_registration_id and instance_id=p_instance_id for update;
 if not found then raise exception 'registration not found for this location'; end if;
 if v_old is distinct from p_expected_item then raise exception 'giveaway selection changed; refresh before dispensing'; end if;
 if v_item is not distinct from v_old then return jsonb_build_object('registrationId',p_registration_id,'giveawayItem',v_old); end if;
 if v_old is not null or v_item is null then raise exception 'issued items are locked; use Manage items in the updated app'; end if;
 v_result:=tdqsys_issue_giveaways(p_instance_id,p_registration_id,jsonb_build_array(v_item),gen_random_uuid());
 return v_result||jsonb_build_object('giveawayItem',v_item);
end $$;
revoke all on function public.tdqsys_issue_giveaways(text,uuid,jsonb,uuid),public.tdqsys_giveaway_snapshot(text),public.tdqsys_set_giveaway(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tdqsys_issue_giveaways(text,uuid,jsonb,uuid),public.tdqsys_giveaway_snapshot(text),public.tdqsys_set_giveaway(text,uuid,text,text) to service_role;
commit;
