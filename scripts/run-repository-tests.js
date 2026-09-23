#!/usr/bin/env node
/********************************************************************
 * Repository integration test runner (Node native test + real Neon PG).
 *
 * Requires DATABASE_URL_POOLED or DATABASE_URL (Neon). CI sets these via
 * GitHub secrets; local dev uses repo-root .env.
 ********************************************************************/

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL_POOLED && process.env.DATABASE_URL) {
  process.env.DATABASE_URL_POOLED = process.env.DATABASE_URL;
}

const connectionString = String(
  process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || ''
).trim();

if (!connectionString) {
  console.error(
    '[test:repositories] DATABASE_URL_POOLED (or DATABASE_URL) is required.\n' +
    '  Local: add your Neon pooler URL to .env\n' +
    '  CI: configure GitHub secrets DATABASE_URL_POOLED and/or DATABASE_URL'
  );
  process.exit(1);
}

const repoDir = path.join(__dirname, '..', 'tests', 'repositories');
const testFiles = fs.readdirSync(repoDir)
  .filter((name) => name.endsWith('.repository.test.js'))
  .sort()
  .map((name) => path.join(repoDir, name));

if (!testFiles.length) {
  console.error('[test:repositories] No *.repository.test.js files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', '--test-timeout=60000', ...testFiles],
  { stdio: 'inherit', env: process.env }
);

process.exit(typeof result.status === 'number' ? result.status : 1);
