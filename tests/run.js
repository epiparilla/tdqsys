'use strict';
// Zero-dependency test runner.
//
//   node tests/run.js
//
// Equivalent to `node --test "tests/*.test.js"`, but works the same way in
// PowerShell, cmd and any shell, because the glob never has to survive shell
// expansion. Prints a one-line summary and exits non-zero on failure so it can
// gate a commit or a release.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join(DIR, f));

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

console.log(`Running ${files.length} test file(s) against v${require('./helpers').appVersion()}\n`);

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  cwd: path.resolve(DIR, '..')
});

process.exit(result.status === null ? 1 : result.status);