'use strict';

// Guards the migration away from the 2-second cloud polling loop.  The local
// display still polls its local engine; public client pages receive DB changes
// over one filtered Supabase Realtime channel instead.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');

test('public client loads Supabase realtime and only retains a slow outage fallback', () => {
  const client = fs.readFileSync(path.join(ROOT, 'public', 'client.html'), 'utf8');
  const af = fs.readFileSync(path.join(ROOT, 'public', 'af.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '202610120001_queue_state.sql'), 'utf8');

  assert.match(client, /supabase-realtime\.js/);
  assert.match(client, /afSubscribeCloudState/);
  assert.match(client, /setInterval\(\(\) => pollData\(\), 30000\)/,
    'cloud outage fallback must be slow enough not to recreate the KV issue');
  assert.match(af, /table: 'queue_state'/);
  assert.match(af, /filter: `instance_id=eq\.\$\{id\}`/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /supabase_realtime add table public\.queue_state/i);
});
