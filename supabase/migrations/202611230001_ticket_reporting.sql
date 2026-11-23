-- Read-only, location-scoped reporting. Never opens/resets a run.
create or replace function public.tdqsys_ticket_report(p_instance_id text,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_from date; v_to date; v_zone text; v_runs jsonb; v_tickets jsonb; v_leads jsonb;
begin
 select coalesce(timezone,'Asia/Manila') into v_zone from test_drive_settings where instance_id=p_instance_id;
 v_zone:=coalesce(v_zone,'Asia/Manila');
 select coalesce(p_to,max(operating_day),(now() at time zone v_zone)::date) into v_to from queue_runs where instance_id=p_instance_id;
 v_from:=coalesce(p_from,v_to);
 if v_to<v_from or v_to-v_from>366 then raise exception 'Choose a reporting period of at most 367 days.'; end if;
 if (select count(*) from test_drive_entries e join queue_runs q on q.id=e.queue_run_id
     where e.instance_id=p_instance_id and q.instance_id=p_instance_id and q.operating_day between v_from and v_to)>50000
 then raise exception 'Report exceeds 50,000 tickets. Choose a shorter period.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',operating_day,'number',run_number,'status',status,'reason',reset_reason)
 order by operating_day,run_number),'[]'::jsonb) into v_runs from queue_runs where instance_id=p_instance_id and operating_day between v_from and v_to;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'registrationId',r.id,'runId',q.id,'day',q.operating_day,'runNumber',q.run_number,
 'brandKey',m.brand_key,'unitIndex',m.unit_index,'model',m.full_name,'number',e.queue_number,'status',e.status,'issuedAt',e.issued_at,
 'submittedAt',coalesce(j.payload_snapshot->>'submittedAt',r.submitted_at::text),
 'name',coalesce(j.payload_snapshot->>'fullName',r.full_name),'email',coalesce(j.payload_snapshot->>'email',r.email),
 'cityAddress',coalesce(j.payload_snapshot->>'cityAddress',r.city_address),'contactNumber',coalesce(j.payload_snapshot->>'contactNumber',r.contact_number),
 'forApplication',r.for_application,'forReservation',r.for_reservation,
 'agent',coalesce(j.payload_snapshot->'se'->>'name',s.name),
 'dealership',coalesce(nullif(btrim(j.payload_snapshot->'se'->>'dealership'),''),nullif(btrim(s.dealership),''),'Unassigned dealership'))
 order by q.operating_day,q.run_number,e.issued_at,e.id),'[]'::jsonb) into v_tickets
 from test_drive_entries e join queue_runs q on q.id=e.queue_run_id and q.instance_id=e.instance_id
 join registrations r on r.id=e.registration_id and r.instance_id=e.instance_id
 join vehicle_models m on m.id=e.vehicle_model_id and m.instance_id=e.instance_id
 left join sheet_sync_jobs j on j.registration_id=r.id
 left join se_daily_checkins c on c.id=r.se_daily_checkin_id and c.instance_id=r.instance_id
 left join sales_executives s on s.id=c.sales_executive_id and s.instance_id=r.instance_id
 where e.instance_id=p_instance_id and q.operating_day between v_from and v_to;
 -- Count every submitted form, including duplicate-protected submissions with
 -- no ticket. Attribute these to the run open when submitted, not by name.
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'day',(r.submitted_at at time zone v_zone)::date,
 'runId',coalesce((select e.queue_run_id from test_drive_entries e join queue_runs q on q.id=e.queue_run_id
 where e.registration_id=r.id and e.instance_id=p_instance_id and q.instance_id=p_instance_id order by q.opened_at,e.issued_at,e.id limit 1),
 (select q.id from queue_runs q where q.instance_id=p_instance_id and r.submitted_at>=q.opened_at
 and (q.closed_at is null or r.submitted_at<q.closed_at) order by q.opened_at desc limit 1)))),'[]'::jsonb)
 into v_leads from registrations r where r.instance_id=p_instance_id
 and r.submitted_at >= (v_from::timestamp at time zone v_zone) and r.submitted_at < ((v_to+1)::timestamp at time zone v_zone);
 return jsonb_build_object('instanceId',p_instance_id,'from',v_from,'to',v_to,'timezone',v_zone,'asOf',statement_timestamp(),
 'runs',v_runs,'tickets',v_tickets,'leads',v_leads);
end $$;
revoke all on function public.tdqsys_ticket_report(text,date,date) from public,anon,authenticated;
grant execute on function public.tdqsys_ticket_report(text,date,date) to service_role;
