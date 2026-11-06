begin;
-- Supabase may grant anon/authenticated explicitly through default privileges.
-- Revoking PUBLIC alone does not remove those direct grants. All TDQSYS RPCs
-- are called by our server-side service role; browser viewers read queue_state.
do $$
declare fn record;
begin
 for fn in select p.oid::regprocedure signature from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'tdqsys\_%' escape '\'
 loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end $$;
-- Global defaults must be revoked too: per-schema REVOKE cannot override a
-- global default GRANT. Existing non-TDQSYS functions are not changed.
alter default privileges revoke execute on functions from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
commit;
