-- Empty statements disable their form question. Preserve all existing text,
-- snapshots, versions, defaults and location records. NULL remains forbidden.
begin;
alter table public.test_drive_settings
  drop constraint if exists test_drive_settings_waiver_statement_check,
  drop constraint if exists test_drive_settings_terms_and_conditions_check;
commit;
