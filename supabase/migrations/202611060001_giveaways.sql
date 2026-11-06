begin;
alter table public.test_drive_settings add column if not exists giveaway_items jsonb not null default '[]'::jsonb check(jsonb_typeof(giveaway_items)='array');
alter table public.registrations add column if not exists giveaway_item text;
alter table public.registrations add column if not exists giveaway_updated_at timestamptz;

create or replace function public.tdqsys_configure_giveaways(p_instance_id text,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_items jsonb;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'giveaway items must be a list'; end if;
  if jsonb_array_length(p_items)>200 or exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 160 or lower(btrim(x#>>'{}'))='unclaimed') then raise exception 'invalid giveaway item list'; end if;
  select coalesce(jsonb_agg(name order by position),'[]'::jsonb) into v_items from (
    select distinct on (lower(btrim(value))) btrim(value) name,ordinality position
    from jsonb_array_elements_text(p_items) with ordinality order by lower(btrim(value)),ordinality
  ) items;
  update test_drive_settings set giveaway_items=v_items where instance_id=p_instance_id;
  if not found then raise exception 'location settings are not configured'; end if;
end $$;

create or replace function public.tdqsys_giveaway_snapshot(p_instance_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_zone text; v_day date; v_rows jsonb;
begin
  select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
  v_zone:=coalesce(v_zone,'Asia/Manila');
  v_day:=(now() at time zone v_zone)::date;
  select coalesce(jsonb_agg(
    coalesce(j.payload_snapshot,jsonb_build_object('submittedAt',r.submitted_at,'fullName',r.full_name,'email',r.email,
      'cityAddress',r.city_address,'contactNumber',r.contact_number,'forApplication',r.for_application,'forReservation',r.for_reservation))
    ||jsonb_build_object('registrationId',r.id,'giveawayItem',r.giveaway_item,'giveawayUpdatedAt',r.giveaway_updated_at)
    order by r.submitted_at,r.id),'[]'::jsonb) into v_rows
  from registrations r left join sheet_sync_jobs j on j.registration_id=r.id
  where r.instance_id=p_instance_id and (r.submitted_at at time zone v_zone)::date=v_day;
  return jsonb_build_object('day',v_day,'timezone',v_zone,'registrations',v_rows,
    'giveawayItems',coalesce((select giveaway_items from test_drive_settings where instance_id=p_instance_id),'[]'::jsonb));
end $$;

create or replace function public.tdqsys_set_giveaway(p_instance_id text,p_registration_id uuid,p_item text,p_expected_item text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old text; v_item text:=nullif(btrim(p_item),''); v_time timestamptz:=now();
begin
  select giveaway_item into v_old from registrations where id=p_registration_id and instance_id=p_instance_id for update;
  if not found then raise exception 'registration not found for this location'; end if;
  if v_old is distinct from p_expected_item then raise exception 'giveaway selection changed; refresh before dispensing'; end if;
  if v_item is not null and not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.giveaway_items) i where s.instance_id=p_instance_id and i=v_item) then raise exception 'select a configured giveaway item'; end if;
  update registrations set giveaway_item=v_item,giveaway_updated_at=v_time where id=p_registration_id;
  return jsonb_build_object('registrationId',p_registration_id,'giveawayItem',v_item,'giveawayUpdatedAt',v_time);
end $$;

revoke all on function public.tdqsys_configure_giveaways(text,jsonb) from public,anon,authenticated;
revoke all on function public.tdqsys_giveaway_snapshot(text) from public,anon,authenticated;
revoke all on function public.tdqsys_set_giveaway(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tdqsys_configure_giveaways(text,jsonb) to service_role;
grant execute on function public.tdqsys_giveaway_snapshot(text) to service_role;
grant execute on function public.tdqsys_set_giveaway(text,uuid,text,text) to service_role;
commit;
