begin;
alter table public.test_drive_settings add column if not exists dealerships jsonb not null default '[]'::jsonb check(jsonb_typeof(dealerships)='array');

create or replace function public.tdqsys_configure_registration(p_instance_id text,p_models jsonb,p_waiver text,p_terms text,p_sheets_url text,p_dealerships jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_dealers jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  if p_dealerships is null or jsonb_typeof(p_dealerships)<>'array' then raise exception 'dealerships must be a list'; end if;
  if jsonb_array_length(p_dealerships)>200 or exists(select 1 from jsonb_array_elements(p_dealerships) x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 160) then raise exception 'invalid dealership list'; end if;
  select coalesce(jsonb_agg(name order by position),'[]'::jsonb) into v_dealers from (
    select distinct on (lower(btrim(value))) btrim(value) name,ordinality position from jsonb_array_elements_text(p_dealerships) with ordinality order by lower(btrim(value)),ordinality
  ) names;
  perform tdqsys_configure_test_drive(p_instance_id,p_models,p_waiver,p_terms,p_sheets_url);
  update test_drive_settings set dealerships=v_dealers where instance_id=p_instance_id;
end $$;
revoke all on function public.tdqsys_configure_registration(text,jsonb,text,text,text,jsonb) from public;
grant execute on function public.tdqsys_configure_registration(text,jsonb,text,text,text,jsonb) to service_role;

create or replace function public.tdqsys_public_registration_config(p_instance_id text)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'models',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name) order by full_name) from vehicle_models where instance_id=p_instance_id and active),'[]'::jsonb),
    'dealerships',coalesce((select dealerships from test_drive_settings where instance_id=p_instance_id),'[]'::jsonb),
    'waiverStatement',coalesce((select waiver_statement from test_drive_settings where instance_id=p_instance_id),''),
    'termsAndConditions',coalesce((select terms_and_conditions from test_drive_settings where instance_id=p_instance_id),''),
    'waiverVersion',(select encode(sha256(convert_to(waiver_statement,'UTF8')),'hex') from test_drive_settings where instance_id=p_instance_id),
    'termsVersion',(select encode(sha256(convert_to(terms_and_conditions,'UTF8')),'hex') from test_drive_settings where instance_id=p_instance_id)
  );
$$;
revoke all on function public.tdqsys_public_registration_config(text) from public;
grant execute on function public.tdqsys_public_registration_config(text) to service_role;

create or replace function public.tdqsys_register_se_checkin(p_instance_id text,p_name text,p_dealership text,p_operating_day date,p_code_hash text,p_code_ciphertext text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_se_id uuid; v_checkin_id uuid;
begin
  if p_instance_id !~ '^[0-9a-f-]{1,64}$' then raise exception 'invalid instance id'; end if;
  if length(btrim(coalesce(p_name,'')))=0 or length(btrim(coalesce(p_dealership,'')))=0 then raise exception 'name and dealership are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  if not exists(select 1 from test_drive_settings s,jsonb_array_elements_text(s.dealerships) d where s.instance_id=p_instance_id and d=btrim(p_dealership)) then raise exception 'select a configured dealership'; end if;
  insert into sales_executives(instance_id,name,dealership) values(p_instance_id,btrim(p_name),btrim(p_dealership)) on conflict(instance_id,name,dealership) do update set updated_at=now() returning id into v_se_id;
  insert into se_daily_checkins(instance_id,sales_executive_id,operating_day,code_hash,code_ciphertext,expires_at) values(p_instance_id,v_se_id,p_operating_day,p_code_hash,p_code_ciphertext,p_expires_at) returning id into v_checkin_id;
  insert into print_jobs(instance_id,kind,se_daily_checkin_id) values(p_instance_id,'se_code_slip',v_checkin_id);
  insert into audit_log(instance_id,actor_type,action,target_type,target_id,details) values(p_instance_id,'public_se_form','se_checked_in','se_daily_checkin',v_checkin_id::text,jsonb_build_object('sales_executive_id',v_se_id,'operating_day',p_operating_day));
  return v_checkin_id;
end $$;
revoke all on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz) from public;
grant execute on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz) to service_role;
commit;
