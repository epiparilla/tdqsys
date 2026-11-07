begin;
-- Only replace human-readable messages/comments, not underscored SQL identifiers.
-- CREATE OR REPLACE preserves each routine's signature, ownership and grants.
do $$
declare fn record; definition text; updated text;
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'tdqsys\_%' escape '\'
 loop
  definition:=pg_get_functiondef(fn.oid);
  updated:=replace(replace(definition,'Sales Executives','Agents'),'Sales Executive','Agent');
  updated:=regexp_replace(regexp_replace(updated,'\mSEs\M','Agents','g'),'\mSE\M','Agent','g');
  if updated<>definition then execute updated;end if;
 end loop;
end $$;
commit;
