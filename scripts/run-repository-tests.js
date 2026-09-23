#!/usr/bin/env node
/********************************************************************
 * Repository integration test runner (Node native test + real Neon PG).
 *
 * Requires DATABASE_URL_POOLED or DATABASE_URL (Neon). CI sets these via
 * GitHub secrets; local dev uses repo-root .env.
 *
 * Runs each *.repository.test.js in its own process with a short pause
 * between files to avoid Neon HTTP adapter timeouts under serial CI load.
 * Failed files are retried with exponential backoff.
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

const FILE_DELAY_MS = Number(process.env.REPO_TEST_FILE_DELAY_MS || 200);
const MAX_FILE_RETRIES = Number(process.env.REPO_TEST_FILE_RETRIES || 2);
const TEST_TIMEOUT_MS = Number(process.env.REPO_TEST_TIMEOUT_MS || 120000);

const repoDir = path.join(__dirname, '..', 'tests', 'repositories');
const testFiles = fs.readdirSync(repoDir)
  .filter((name) => name.endsWith('.repository.test.js'))
  .sort()
  .map((name) => path.join(repoDir, name));

if (!testFiles.length) {
  console.error('[test:repositories] No *.repository.test.js files found.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTestFile(file) {
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`, file],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        REPOSITORY_TEST: '1',
        NEON_FETCH_TIMEOUT_MS: process.env.NEON_FETCH_TIMEOUT_MS || '90000',
        NEON_RETRY_ATTEMPTS: process.env.NEON_RETRY_ATTEMPTS || '4',
        NEON_RETRY_BASE_DELAY_MS: process.env.NEON_RETRY_BASE_DELAY_MS || '300'
      }
    }
  );

  return typeof result.status === 'number' ? result.status : 1;
}

(async () => {
  console.log(
    `[test:repositories] Running ${testFiles.length} files ` +
    `(timeout=${TEST_TIMEOUT_MS}ms, fileDelay=${FILE_DELAY_MS}ms, retries=${MAX_FILE_RETRIES})`
  );

  const failedFiles = [];

  for (let index = 0; index < testFiles.length; index++) {
    const file = testFiles[index];
    const label = path.basename(file);
    let status = 1;

    for (let attempt = 0; attempt <= MAX_FILE_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoffMs = FILE_DELAY_MS * attempt * 3;
        console.log(
          `[test:repositories] retry ${attempt}/${MAX_FILE_RETRIES} for ${label} ` +
          `(backoff ${backoffMs}ms)`
        );
        await sleep(backoffMs);
      } else {
        console.log(`[test:repositories] ${index + 1}/${testFiles.length} ${label}`);
      }

      status = runTestFile(file);
      if (status === 0) {
        break;
      }
    }

    if (status !== 0) {
      failedFiles.push(label);
    }

    if (index < testFiles.length - 1 && FILE_DELAY_MS > 0) {
      await sleep(FILE_DELAY_MS);
    }
  }

  if (failedFiles.length) {
    console.error(
      `[test:repositories] Failed after retries: ${failedFiles.join(', ')}`
    );
    process.exit(1);
  }

  console.log(`[test:repositories] All ${testFiles.length} files passed.`);
  process.exit(0);
})();
