begin;
-- Legacy SEs have no invented contact; new public submissions require 11 digits.
alter table public.sales_executives add column if not exists contact_number text;
create or replace function public.tdqsys_register_se_checkin(
 p_instance_id text,p_name text,p_dealership text,p_operating_day date,
 p_code_hash text,p_code_ciphertext text,p_expires_at timestamptz,p_contact_number text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_checkin uuid;
begin
 if p_contact_number is null or length(p_contact_number)<>11 or p_contact_number !~ '^[0-9]{11}$' then
  raise exception 'contact number must contain exactly 11 digits';
 end if;
 v_checkin:=tdqsys_register_se_checkin(p_instance_id,p_name,p_dealership,p_operating_day,p_code_hash,p_code_ciphertext,p_expires_at);
 update sales_executives set contact_number=p_contact_number
 where id=(select sales_executive_id from se_daily_checkins where id=v_checkin);
 return v_checkin;
end $$;
revoke all on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.tdqsys_register_se_checkin(text,text,text,date,text,text,timestamptz,text) to service_role;

-- Inserts only: do not rewrite or invalidate legacy client contact records.
create or replace function public.tdqsys_validate_client_contact()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.contact_number is null or length(new.contact_number)<>11 or new.contact_number !~ '^[0-9]{11}$' then
  raise exception 'contact number must contain exactly 11 digits';
 end if;
 return new;
end $$;
drop trigger if exists tdqsys_validate_client_contact on public.registrations;
create trigger tdqsys_validate_client_contact before insert on public.registrations
 for each row execute function public.tdqsys_validate_client_contact();
revoke all on function public.tdqsys_validate_client_contact() from public,anon,authenticated;
commit;
