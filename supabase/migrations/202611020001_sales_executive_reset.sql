begin;
alter table public.se_daily_checkins add column if not exists revoked_at timestamptz;

-- Retain all prior check-ins and their client references, while allowing the
-- same SE to check in again after an explicitly confirmed reset.
do $$ declare item record; begin
  for item in select conname from pg_constraint
    where conrelid='public.se_daily_checkins'::regclass and contype='u'
      and pg_get_constraintdef(oid)='UNIQUE (sales_executive_id, operating_day)'
  loop execute format('alter table public.se_daily_checkins drop constraint %I',item.conname); end loop;
end $$;
create unique index if not exists se_daily_checkins_sales_executive_id_operating_day_active_key
  on public.se_daily_checkins(sales_executive_id,operating_day) where revoked_at is null;

create or replace function public.tdqsys_register_se_checkin(
  p_instance_id text,p_name text,p_dealership text,p_operating_day date,
  p_code_hash text,p_code_ciphertext text,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_se_id uuid; v_checkin_id uuid;
begin
  if p_instance_id !~ '^[0-9a-f-]{1,64}$' then raise exception 'invalid instance id'; end if;
  if length(btrim(coalesce(p_name,'')))=0 or length(btrim(coalesce(p_dealership,'')))=0 then raise exception 'name and dealership are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  insert into sales_executives(instance_id,name,dealership) values(p_instance_id,btrim(p_name),btrim(p_dealership))
    on conflict(instance_id,name,dealership) do update set updated_at=now() returning id into v_se_id;
  insert into se_daily_checkins(instance_id,sales_executive_id,operating_day,code_hash,code_ciphertext,expires_at)
    values(p_instance_id,v_se_id,p_operating_day,p_code_hash,p_code_ciphertext,p_expires_at) returning id into v_checkin_id;
  insert into print_jobs(instance_id,kind,se_daily_checkin_id) values(p_instance_id,'se_code_slip',v_checkin_id);
  insert into audit_log(instance_id,actor_type,action,target_type,target_id,details)
    values(p_instance_id,'public_se_form','se_checked_in','se_daily_checkin',v_checkin_id::text,
      jsonb_build_object('sales_executive_id',v_se_id,'operating_day',p_operating_day));
  return v_checkin_id;
end $$;

create or replace function public.tdqsys_reset_sales_executives(p_instance_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_day date; v_zone text; v_count integer;
begin
  if length(btrim(coalesce(p_reason,''))) not between 1 and 240 then raise exception 'reset reason is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_instance_id,0));
  select timezone into v_zone from test_drive_settings where instance_id=p_instance_id;
  if not found then raise exception 'location is not configured'; end if;
  v_day := (now() at time zone v_zone)::date;
  update se_daily_checkins set revoked_at=now(),expires_at=least(expires_at,now())
    where instance_id=p_instance_id and operating_day=v_day and revoked_at is null;
  get diagnostics v_count = row_count;
  update print_jobs set status='cancelled',updated_at=now(),last_error='SE code deactivated by confirmed reset'
    where instance_id=p_instance_id and kind='se_code_slip' and status in ('pending','claimed','failed')
      and se_daily_checkin_id in(select id from se_daily_checkins where instance_id=p_instance_id and operating_day=v_day and revoked_at is not null);
  insert into audit_log(instance_id,actor_type,actor_id,action,target_type,target_id,details)
    values(p_instance_id,'desktop','facilitator','sales_executives_reset','se_daily_checkins',v_day::text,
      jsonb_build_object('reason',btrim(p_reason),'deactivated',v_count));
  return jsonb_build_object('deactivated',v_count,'operatingDay',v_day);
end $$;
revoke all on function public.tdqsys_reset_sales_executives(text,text) from public;
grant execute on function public.tdqsys_reset_sales_executives(text,text) to service_role;
revoke all on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz) from public;
grant execute on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz) to service_role;
commit;
