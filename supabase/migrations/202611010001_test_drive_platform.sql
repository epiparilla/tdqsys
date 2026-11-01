-- TDQSYS test-drive platform
--
-- Registration and facilitator data is deliberately separate from queue_state.
-- queue_state is readable by public QR viewers; none of the tables below may
-- expose personal data to anon/authenticated browser roles.

create extension if not exists pgcrypto;

create table if not exists public.vehicle_models (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    full_name text not null check (length(btrim(full_name)) between 1 and 120),
    printable_shortname text not null check (length(btrim(printable_shortname)) between 1 and 36),
    active boolean not null default true,
    retired_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (instance_id, full_name)
);

create table if not exists public.sales_executives (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    name text not null check (length(btrim(name)) between 1 and 120),
    dealership text not null check (length(btrim(dealership)) between 1 and 160),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (instance_id, name, dealership)
);

create table if not exists public.se_daily_checkins (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    sales_executive_id uuid not null references public.sales_executives(id),
    operating_day date not null,
    code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
    -- The generator validates with code_hash. Ciphertext is only for printing
    -- the already assigned slip again; it must be encrypted by the endpoint.
    code_ciphertext text not null,
    issued_at timestamptz not null default now(),
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    unique (instance_id, operating_day, code_hash),
    unique (sales_executive_id, operating_day)
);

create table if not exists public.queue_runs (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    operating_day date not null,
    run_number integer not null check (run_number > 0),
    status text not null default 'active' check (status in ('active', 'closed')),
    reset_reason text not null default 'daily_open' check (length(btrim(reset_reason)) between 1 and 240),
    opened_by text,
    opened_at timestamptz not null default now(),
    closed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (instance_id, operating_day, run_number)
);

create unique index if not exists queue_runs_one_active_per_location
    on public.queue_runs (instance_id) where status = 'active';

create table if not exists public.queue_counters (
    queue_run_id uuid not null references public.queue_runs(id) on delete cascade,
    vehicle_model_id uuid not null references public.vehicle_models(id),
    last_issued_number integer not null default 0 check (last_issued_number >= 0),
    updated_at timestamptz not null default now(),
    primary key (queue_run_id, vehicle_model_id)
);

create table if not exists public.registrations (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    full_name text not null check (length(btrim(full_name)) between 1 and 160),
    name_search text not null check (length(btrim(name_search)) between 1 and 160),
    email text not null check (length(btrim(email)) between 3 and 320),
    city_address text not null check (length(btrim(city_address)) between 1 and 240),
    contact_number text not null check (length(btrim(contact_number)) between 1 and 40),
    for_application boolean,
    for_reservation boolean,
    se_daily_checkin_id uuid not null references public.se_daily_checkins(id),
    waiver_version text not null check (length(btrim(waiver_version)) > 0),
    terms_version text not null check (length(btrim(terms_version)) > 0),
    consented_at timestamptz not null,
    idempotency_key text not null check (length(btrim(idempotency_key)) between 8 and 200),
    submitted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (instance_id, idempotency_key)
);

create index if not exists registrations_name_search_idx
    on public.registrations (instance_id, name_search, submitted_at desc);

create table if not exists public.test_drive_entries (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    registration_id uuid not null references public.registrations(id),
    queue_run_id uuid not null references public.queue_runs(id),
    vehicle_model_id uuid not null references public.vehicle_models(id),
    queue_number integer not null check (queue_number > 0),
    status text not null default 'waiting'
        check (status in ('waiting', 'ongoing', 'done', 'no_show', 'cancelled')),
    replaced_entry_id uuid references public.test_drive_entries(id),
    issued_at timestamptz not null default now(),
    status_changed_at timestamptz not null default now(),
    status_changed_by text,
    created_at timestamptz not null default now(),
    unique (queue_run_id, vehicle_model_id, queue_number)
);

create index if not exists test_drive_entries_run_model_status_idx
    on public.test_drive_entries (queue_run_id, vehicle_model_id, status, queue_number);
create index if not exists test_drive_entries_registration_idx
    on public.test_drive_entries (registration_id, issued_at desc);
create unique index if not exists test_drive_entries_one_ongoing_per_run
    on public.test_drive_entries (queue_run_id) where status = 'ongoing';

create table if not exists public.display_state (
    instance_id text primary key check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    queue_run_id uuid references public.queue_runs(id),
    active_test_drive_entry_id uuid references public.test_drive_entries(id),
    updated_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
    id uuid primary key default gen_random_uuid(),
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    kind text not null check (kind in ('client_ticket', 'se_code_slip')),
    test_drive_entry_id uuid references public.test_drive_entries(id),
    se_daily_checkin_id uuid references public.se_daily_checkins(id),
    status text not null default 'pending'
        check (status in ('pending', 'claimed', 'printed', 'failed', 'handed_over', 'cancelled')),
    claimed_at timestamptz,
    printed_at timestamptz,
    handed_over_at timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
      (kind = 'client_ticket' and test_drive_entry_id is not null and se_daily_checkin_id is null)
      or
      (kind = 'se_code_slip' and se_daily_checkin_id is not null and test_drive_entry_id is null)
    )
);

create unique index if not exists print_jobs_one_initial_client_ticket
    on public.print_jobs (test_drive_entry_id)
    where kind = 'client_ticket' and status <> 'cancelled';
create index if not exists print_jobs_active_idx
    on public.print_jobs (instance_id, status, created_at)
    where status in ('pending', 'claimed', 'failed');

create table if not exists public.sheet_sync_jobs (
    id uuid primary key default gen_random_uuid(),
    registration_id uuid not null unique references public.registrations(id) on delete cascade,
    payload_snapshot jsonb not null,
    status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default now(),
    last_error text,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
    id bigint generated always as identity primary key,
    instance_id text not null check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    actor_type text not null,
    actor_id text,
    action text not null,
    target_type text not null,
    target_id text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.test_drive_settings (
    instance_id text primary key check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    waiver_statement text not null default 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    terms_and_conditions text not null default 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    timezone text not null default 'Asia/Manila',
    updated_at timestamptz not null default now(),
    check (length(btrim(waiver_statement)) > 0),
    check (length(btrim(terms_and_conditions)) > 0)
);

create index if not exists audit_log_instance_created_idx
    on public.audit_log (instance_id, created_at desc);

-- All test-drive data is private. Only service_role-backed Pages/Edge
-- functions may access it; browser anon/authenticated roles have no grants.
alter table public.vehicle_models enable row level security;
alter table public.sales_executives enable row level security;
alter table public.se_daily_checkins enable row level security;
alter table public.queue_runs enable row level security;
alter table public.queue_counters enable row level security;
alter table public.registrations enable row level security;
alter table public.test_drive_entries enable row level security;
alter table public.display_state enable row level security;
alter table public.print_jobs enable row level security;
alter table public.sheet_sync_jobs enable row level security;
alter table public.audit_log enable row level security;
alter table public.test_drive_settings enable row level security;

revoke all on public.vehicle_models, public.sales_executives, public.se_daily_checkins,
    public.queue_runs, public.queue_counters, public.registrations,
    public.test_drive_entries, public.display_state, public.print_jobs,
    public.sheet_sync_jobs, public.audit_log from anon, authenticated;
revoke all on public.test_drive_settings from anon, authenticated;

grant all on public.vehicle_models, public.sales_executives, public.se_daily_checkins,
    public.queue_runs, public.queue_counters, public.registrations,
    public.test_drive_entries, public.display_state, public.print_jobs,
    public.sheet_sync_jobs, public.audit_log to service_role;
grant all on public.test_drive_settings to service_role;

-- Open a fresh run, used for a first daily run and for same-day reset. The
-- caller must supply the operator/reason; this function preserves history.
create or replace function public.tdqsys_open_queue_run(
    p_instance_id text,
    p_operating_day date,
    p_reset_reason text,
    p_opened_by text default null
) returns public.queue_runs
language plpgsql
security definer
set search_path = public
as $$
declare
    v_run public.queue_runs;
    v_next integer;
begin
    if p_instance_id !~ '^[0-9a-f-]{1,64}$' then
        raise exception 'invalid instance id';
    end if;
    if length(btrim(coalesce(p_reset_reason, ''))) = 0 then
        raise exception 'reset reason is required';
    end if;

    -- Serialise opening/resetting a location's run.
    perform pg_advisory_xact_lock(hashtextextended(p_instance_id, 0));

    update public.queue_runs
       set status = 'closed', closed_at = now()
     where instance_id = p_instance_id and status = 'active';

    select coalesce(max(run_number), 0) + 1 into v_next
      from public.queue_runs
     where instance_id = p_instance_id and operating_day = p_operating_day;

    insert into public.queue_runs(instance_id, operating_day, run_number, reset_reason, opened_by)
    values (p_instance_id, p_operating_day, v_next, btrim(p_reset_reason), p_opened_by)
    returning * into v_run;

    insert into public.display_state(instance_id, queue_run_id, active_test_drive_entry_id, updated_at)
    values (p_instance_id, v_run.id, null, now())
    on conflict (instance_id) do update
       set queue_run_id = excluded.queue_run_id,
           active_test_drive_entry_id = null,
           updated_at = now();

    insert into public.audit_log(instance_id, actor_type, actor_id, action, target_type, target_id, details)
    values (p_instance_id, 'desktop', p_opened_by, 'queue_run_opened', 'queue_run', v_run.id::text,
            jsonb_build_object('operating_day', p_operating_day, 'run_number', v_next, 'reason', p_reset_reason));
    return v_run;
end;
$$;

-- Move the one live display ticket forward without exposing a transient state
-- where two entries are ongoing.
create or replace function public.tdqsys_set_ongoing(
    p_entry_id uuid,
    p_actor_id text default null
) returns public.test_drive_entries
language plpgsql
security definer
set search_path = public
as $$
declare
    v_entry public.test_drive_entries;
begin
    select * into v_entry from public.test_drive_entries where id = p_entry_id for update;
    if not found then raise exception 'entry not found'; end if;
    if not exists (select 1 from public.queue_runs where id = v_entry.queue_run_id and status = 'active') then
        raise exception 'entry is not in the active run';
    end if;
    if v_entry.status in ('cancelled', 'no_show') then
        raise exception 'entry cannot become ongoing';
    end if;

    update public.test_drive_entries
       set status = 'done', status_changed_at = now(), status_changed_by = p_actor_id
     where queue_run_id = v_entry.queue_run_id and status = 'ongoing' and id <> v_entry.id;

    update public.test_drive_entries
       set status = 'ongoing', status_changed_at = now(), status_changed_by = p_actor_id
     where id = v_entry.id
    returning * into v_entry;

    insert into public.display_state(instance_id, queue_run_id, active_test_drive_entry_id, updated_at)
    values (v_entry.instance_id, v_entry.queue_run_id, v_entry.id, now())
    on conflict (instance_id) do update
       set queue_run_id = excluded.queue_run_id,
           active_test_drive_entry_id = excluded.active_test_drive_entry_id,
           updated_at = now();

    insert into public.audit_log(instance_id, actor_type, actor_id, action, target_type, target_id)
    values (v_entry.instance_id, 'desktop', p_actor_id, 'entry_ongoing', 'test_drive_entry', v_entry.id::text);
    return v_entry;
end;
$$;

revoke all on function public.tdqsys_open_queue_run(text, date, text, text) from public;
revoke all on function public.tdqsys_set_ongoing(uuid, text) from public;
grant execute on function public.tdqsys_open_queue_run(text, date, text, text) to service_role;
grant execute on function public.tdqsys_set_ongoing(uuid, text) to service_role;

-- Register one Sales Executive for the operating day and enqueue the code slip.
-- The Pages endpoint generates/hash-encrypts the code and retries a collision.
create or replace function public.tdqsys_register_se_checkin(
    p_instance_id text,
    p_name text,
    p_dealership text,
    p_operating_day date,
    p_code_hash text,
    p_code_ciphertext text,
    p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_se_id uuid;
    v_checkin_id uuid;
begin
    if p_instance_id !~ '^[0-9a-f-]{1,64}$' then raise exception 'invalid instance id'; end if;
    if length(btrim(coalesce(p_name, ''))) = 0 or length(btrim(coalesce(p_dealership, ''))) = 0 then
        raise exception 'name and dealership are required';
    end if;

    insert into public.sales_executives(instance_id, name, dealership)
    values (p_instance_id, btrim(p_name), btrim(p_dealership))
    on conflict (instance_id, name, dealership) do update set updated_at = now()
    returning id into v_se_id;

    insert into public.se_daily_checkins(
        instance_id, sales_executive_id, operating_day, code_hash, code_ciphertext, expires_at
    ) values (
        p_instance_id, v_se_id, p_operating_day, p_code_hash, p_code_ciphertext, p_expires_at
    ) returning id into v_checkin_id;

    insert into public.print_jobs(instance_id, kind, se_daily_checkin_id)
    values (p_instance_id, 'se_code_slip', v_checkin_id);

    insert into public.audit_log(instance_id, actor_type, action, target_type, target_id, details)
    values (p_instance_id, 'public_se_form', 'se_checked_in', 'se_daily_checkin', v_checkin_id::text,
            jsonb_build_object('sales_executive_id', v_se_id, 'operating_day', p_operating_day));
    return v_checkin_id;
end;
$$;

revoke all on function public.tdqsys_register_se_checkin(text, text, text, date, text, text, timestamptz) from public;
grant execute on function public.tdqsys_register_se_checkin(text, text, text, date, text, text, timestamptz) to service_role;

-- Safe public bootstrap payload for the client form. It deliberately omits
-- contacts, queue entries, shortnames, print jobs, and staff data.
create or replace function public.tdqsys_public_registration_config(p_instance_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'models', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name) order by full_name)
                         from vehicle_models where instance_id = p_instance_id and active), '[]'::jsonb),
    'waiverStatement', coalesce((select waiver_statement from test_drive_settings where instance_id = p_instance_id), ''),
    'termsAndConditions', coalesce((select terms_and_conditions from test_drive_settings where instance_id = p_instance_id), '')
  );
$$;
revoke all on function public.tdqsys_public_registration_config(text) from public;
grant execute on function public.tdqsys_public_registration_config(text) to service_role;

-- Allocate selected tickets as one transaction. The Pages endpoint validates
-- form syntax; this function remains the authority for active code/model/run.
create or replace function public.tdqsys_submit_registration(
    p_instance_id text, p_full_name text, p_name_search text, p_email text,
    p_city_address text, p_contact_number text, p_for_application boolean,
    p_for_reservation boolean, p_code_hash text, p_waiver_version text,
    p_terms_version text, p_idempotency_key text, p_model_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run uuid; v_checkin uuid; v_registration uuid; v_model uuid; v_number integer; v_entry uuid; v_items jsonb := '[]'::jsonb;
declare v_existing record;
begin
  select id into v_run from queue_runs where instance_id=p_instance_id and status='active' for update;
  if v_run is null then raise exception 'no active queue run'; end if;
  select id into v_checkin from se_daily_checkins where instance_id=p_instance_id and code_hash=p_code_hash and expires_at>now() limit 1;
  if v_checkin is null then raise exception 'invalid or expired Sales Executive code'; end if;
  select id into v_registration from registrations where instance_id=p_instance_id and idempotency_key=p_idempotency_key;
  if v_registration is not null then
    return (select jsonb_build_object('registrationId',v_registration,'entries',coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'queueNumber',e.queue_number,'modelId',e.vehicle_model_id)),'[]'::jsonb)) from test_drive_entries e where e.registration_id=v_registration);
  end if;
  if coalesce(array_length(p_model_ids,1),0)=0 then raise exception 'at least one model is required'; end if;
  insert into registrations(instance_id,full_name,name_search,email,city_address,contact_number,for_application,for_reservation,se_daily_checkin_id,waiver_version,terms_version,consented_at,idempotency_key)
  values(p_instance_id,p_full_name,p_name_search,p_email,p_city_address,p_contact_number,p_for_application,p_for_reservation,v_checkin,p_waiver_version,p_terms_version,now(),p_idempotency_key) returning id into v_registration;
  foreach v_model in array p_model_ids loop
    if not exists(select 1 from vehicle_models where id=v_model and instance_id=p_instance_id and active) then raise exception 'invalid vehicle model'; end if;
    select e.id,e.queue_number into v_existing from test_drive_entries e join registrations r on r.id=e.registration_id
      left join display_state d on d.instance_id=e.instance_id and d.queue_run_id=e.queue_run_id
      left join test_drive_entries current_entry on current_entry.id=d.active_test_drive_entry_id
      where e.queue_run_id=v_run and e.vehicle_model_id=v_model and r.name_search=p_name_search
        and e.status in ('waiting','ongoing') and (current_entry.queue_number is null or current_entry.vehicle_model_id <> v_model or e.queue_number>=current_entry.queue_number)
      order by e.issued_at desc limit 1;
    if found then
      v_items:=v_items||jsonb_build_array(jsonb_build_object('entryId',v_existing.id,'queueNumber',v_existing.queue_number,'modelId',v_model,'existing',true));
      continue;
    end if;
    insert into queue_counters(queue_run_id,vehicle_model_id,last_issued_number) values(v_run,v_model,1)
    on conflict(queue_run_id,vehicle_model_id) do update set last_issued_number=queue_counters.last_issued_number+1,updated_at=now()
    returning last_issued_number into v_number;
    insert into test_drive_entries(instance_id,registration_id,queue_run_id,vehicle_model_id,queue_number) values(p_instance_id,v_registration,v_run,v_model,v_number) returning id into v_entry;
    insert into print_jobs(instance_id,kind,test_drive_entry_id) values(p_instance_id,'client_ticket',v_entry);
    v_items:=v_items||jsonb_build_array(jsonb_build_object('entryId',v_entry,'queueNumber',v_number,'modelId',v_model));
  end loop;
  insert into sheet_sync_jobs(registration_id,payload_snapshot) values(v_registration,jsonb_build_object('registrationId',v_registration));
  return jsonb_build_object('registrationId',v_registration,'entries',v_items);
end; $$;
revoke all on function public.tdqsys_submit_registration(text,text,text,text,text,text,boolean,boolean,text,text,text,text,uuid[]) from public;
grant execute on function public.tdqsys_submit_registration(text,text,text,text,text,text,boolean,boolean,text,text,text,text,uuid[]) to service_role;
