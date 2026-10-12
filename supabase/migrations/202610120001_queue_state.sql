-- TDQSYS cloud mirror (Supabase)
--
-- One row holds the complete, small state document for one installed queue
-- engine.  `instance_id` is deliberately the same immutable UUID already
-- embedded in a QR viewer link; it is a routing identifier, not user data.

create table if not exists public.queue_state (
    instance_id text primary key check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    state jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.queue_state enable row level security;

-- The customer viewer is intentionally unauthenticated: a QR link is the
-- capability to view a location's public queue.  It contains no customer PII.
-- Writes never use the browser role; the Cloudflare Pages Function below uses
-- the Supabase service role, which must remain a Cloudflare secret.
drop policy if exists "TDQSYS public queue viewer" on public.queue_state;
create policy "TDQSYS public queue viewer"
    on public.queue_state for select
    to anon, authenticated
    using (true);

revoke insert, update, delete on public.queue_state from anon, authenticated;

-- Deliver row changes to subscribed viewer pages instead of polling every 2s.
do $$
begin
    alter publication supabase_realtime add table public.queue_state;
exception
    when duplicate_object then null;
end $$;

-- Private writer credentials are deliberately separate from queue_state so a
-- public Realtime payload can never leak them.
create schema if not exists private;
create table if not exists private.tdqsys_queue_writers (
    instance_id text primary key check (instance_id ~ '^[0-9a-f-]{1,64}$'),
    token_hash text not null,
    created_at timestamptz not null default now()
);

revoke all on table private.tdqsys_queue_writers from anon, authenticated;
