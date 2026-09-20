// Run: cd backend && node scripts/ops/enableFlags.js --status
// Run: cd backend && node scripts/ops/enableFlags.js --enable=CATEGORY
// Run: cd backend && node scripts/ops/enableFlags.js --enable=CATEGORY,BRAND,DESIGNATION
// Run: cd backend && node scripts/ops/enableFlags.js --disable=CATEGORY

/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: enableFlags.js
 * Location: backend/scripts/ops/enableFlags.js
 * Description: CLI helper for PostgreSQL read-cutover flag rollout.
 *   Prints DigitalOcean App Platform doctl commands — does NOT edit .env.
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { GROUP_ENV, getReadCutoverFlags } = require('../../src/config/readCutoverFlags');

const APP_ID_PLACEHOLDER = process.env.DO_APP_ID || '<APP_ID>';

function normalizeToken(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^READ_PG_/, '');
}

function resolveGroup(token) {
  const upper = normalizeToken(token);
  if (!upper) return null;

  const compact = upper.replace(/[^A-Z0-9]/g, '');

  for (const [group, envKey] of Object.entries(GROUP_ENV)) {
    const envSuffix = envKey.replace(/^READ_PG_/, '');
    const envCompact = envSuffix.replace(/_/g, '');
    const groupCompact = group.replace(/[^a-z0-9]/gi, '').toUpperCase();

    if (upper === envSuffix || upper === envKey) return group;
    if (compact === envCompact || compact === groupCompact) return group;
    if (upper.toLowerCase() === group) return group;
  }

  return null;
}

function parseCsvArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return [];
  return arg
    .slice(prefix.length)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function printUsage() {
  console.log(`
Usage:
  node scripts/ops/enableFlags.js --status
  node scripts/ops/enableFlags.js --enable=CATEGORY
  node scripts/ops/enableFlags.js --enable=CATEGORY,BRAND,DESIGNATION
  node scripts/ops/enableFlags.js --disable=CATEGORY

Notes:
  - Accepts group keys (category), env suffixes (CATEGORY), or full env names (READ_PG_CATEGORY).
  - Does NOT modify .env — prints doctl commands for DigitalOcean App Platform.
  - Set DO_APP_ID in .env to replace the <APP_ID> placeholder.
`.trim());
}

function printStatus() {
  const flags = getReadCutoverFlags();
  const entries = Object.entries(GROUP_ENV);

  console.log('\n=== Read cutover flags (process.env snapshot) ===\n');
  console.log('Env variable                      | Group                | State');
  console.log('----------------------------------|----------------------|------');

  let onCount = 0;
  for (const [group, envKey] of entries) {
    const enabled = flags[group] === true;
    if (enabled) onCount += 1;
    console.log(
      `${envKey.padEnd(33)} | ${group.padEnd(20)} | ${enabled ? 'ON' : 'OFF'}`
    );
  }

  console.log(`\nTotal: ${entries.length} flags | ON: ${onCount} | OFF: ${entries.length - onCount}\n`);
}

function printDoctlCommands(groups, enabled) {
  const value = enabled ? 'true' : 'false';
  const action = enabled ? 'enable' : 'disable';

  console.log(`\n=== ${action.toUpperCase()} ${groups.length} read-cutover flag(s) ===\n`);
  console.log('Set these environment variables on DigitalOcean App Platform (do not edit .env in production):\n');

  for (const group of groups) {
    const envKey = GROUP_ENV[group];
    console.log(`  ${envKey}=${value}`);
  }

  console.log('\nDigitalOcean CLI (one flag per command):\n');

  for (const group of groups) {
    const envKey = GROUP_ENV[group];
    console.log(`doctl apps update ${APP_ID_PLACEHOLDER} \\`);
    console.log(`  --set-env ${envKey}=${value}\n`);
  }

  console.log('After updating env vars, redeploy the app so Node picks up the new values.\n');
}

function resolveGroups(tokens) {
  const resolved = [];
  const unknown = [];

  for (const token of tokens) {
    const group = resolveGroup(token);
    if (!group) {
      unknown.push(token);
      continue;
    }
    if (!resolved.includes(group)) resolved.push(group);
  }

  return { resolved, unknown };
}

function main() {
  const wantsStatus = process.argv.includes('--status');
  const enableTokens = parseCsvArg('--enable');
  const disableTokens = parseCsvArg('--disable');

  if (wantsStatus) {
    printStatus();
    return;
  }

  if (!enableTokens.length && !disableTokens.length) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (enableTokens.length && disableTokens.length) {
    console.error('Error: use either --enable or --disable, not both in one invocation.');
    process.exit(1);
  }

  const tokens = enableTokens.length ? enableTokens : disableTokens;
  const { resolved, unknown } = resolveGroups(tokens);

  if (unknown.length) {
    console.error(`Unknown flag token(s): ${unknown.join(', ')}`);
    console.error('Run with --status to see all valid groups/env vars.');
    process.exit(1);
  }

  if (!resolved.length) {
    console.error('No flags resolved from input.');
    process.exit(1);
  }

  printDoctlCommands(resolved, enableTokens.length > 0);
}

main();
