'use strict';
// Guards the privacy and concurrency properties of the future test-drive
// migration. These are source-level tests because the normal suite has no
// Supabase service/database dependency.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');

const migration = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '202611010001_test_drive_platform.sql'),
  'utf8'
);

test('test-drive migration keeps registration data outside public queue_state', () => {
  assert.doesNotMatch(migration, /alter table\s+public\.queue_state/i,
    'test-drive migration must not turn the public queue mirror into a PII store');
  for (const table of ['registrations', 'se_daily_checkins', 'test_drive_entries', 'print_jobs']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke all on public\.vehicle_models[\s\S]*from anon, authenticated/i);
});

test('test-drive migration has the required daily-run and ticket uniqueness guards', () => {
  assert.match(migration, /queue_runs_one_active_per_location[\s\S]*where status = 'active'/i);
  assert.match(migration, /unique \(instance_id, operating_day, code_hash\)/i);
  assert.match(migration, /unique \(queue_run_id, vehicle_model_id, queue_number\)/i);
  assert.match(migration, /test_drive_entries_one_ongoing_per_run[\s\S]*where status = 'ongoing'/i);
});

test('reset and ongoing functions are transactional server-side primitives', () => {
  assert.match(migration, /function public\.tdqsys_open_queue_run/i);
  assert.match(migration, /pg_advisory_xact_lock/i,
    'reset/open must serialize concurrent requests for the same location');
  assert.match(migration, /function public\.tdqsys_set_ongoing/i);
  assert.match(migration, /set status = 'done'[\s\S]*status = 'ongoing'/i,
    'ongoing must finish the prior entry before promoting the next one');
});

test('SE code reprints use encrypted storage and client consent is retained', () => {
  assert.match(migration, /code_hash text not null/i);
  assert.match(migration, /code_ciphertext text not null/i);
  assert.match(migration, /waiver_version text not null/i);
  assert.match(migration, /terms_version text not null/i);
  assert.match(migration, /consented_at timestamptz not null/i);
  assert.match(migration, /function public\.tdqsys_register_se_checkin/i);
  assert.match(migration, /insert into public\.print_jobs\(instance_id, kind, se_daily_checkin_id\)/i);
});

test('public registration bootstrap exposes only models and consent text', () => {
  assert.match(migration, /function public\.tdqsys_public_registration_config/i);
  assert.match(migration, /'models'/i);
  assert.match(migration, /'waiverStatement'/i);
  assert.match(migration, /'termsAndConditions'/i);
  assert.doesNotMatch(migration.match(/function public\.tdqsys_public_registration_config[\s\S]*?\$\$;/i)?.[0] || '', /contact_number|print_jobs|se_daily_checkins/i);
});
