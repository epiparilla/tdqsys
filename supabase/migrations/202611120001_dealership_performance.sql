begin;
-- Additive, read-only analytics. No queue, client or raw Sheet records change.
create or replace function public.tdqsys_dealership_performance(p_instance_id text,p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not exists(select 1 from queue_runs where id=p_run_id and instance_id=p_instance_id) then
  raise exception 'queue run not found for this location';
 end if;
 with entries as (
  select e.registration_id,e.status,
   regexp_replace(coalesce(nullif(btrim(j.payload_snapshot->'se'->>'dealership'),''),
     nullif(btrim(s.dealership),''),'Unassigned dealership'),'\s+',' ','g') as dealer
  from test_drive_entries e
  join registrations r on r.id=e.registration_id and r.instance_id=p_instance_id
  left join sheet_sync_jobs j on j.registration_id=r.id
  left join se_daily_checkins c on c.id=r.se_daily_checkin_id and c.instance_id=p_instance_id
  left join sales_executives s on s.id=c.sales_executive_id and s.instance_id=p_instance_id
  where e.instance_id=p_instance_id and e.queue_run_id=p_run_id
 ), totals as (
  select min(dealer) as dealership,count(distinct registration_id) as clients,count(*) as tickets,
   count(*) filter(where status='done') as done,count(*) filter(where status='no_show') as no_show
  from entries group by lower(dealer)
 )
 select coalesce(jsonb_agg(jsonb_build_object('dealership',dealership,'clients',clients,'tickets',tickets,'done',done,'noShow',no_show)
   order by clients desc,done desc,dealership),'[]'::jsonb) into v_result from totals;
 return v_result;
end $$;
revoke all on function public.tdqsys_dealership_performance(text,uuid) from public,anon,authenticated;
grant execute on function public.tdqsys_dealership_performance(text,uuid) to service_role;
commit;
