// Run: cd backend && node scripts/ops/monitorCutover.js
// Run: cd backend && node scripts/ops/monitorCutover.js --logfile=./app.log

/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: monitorCutover.js
 * Location: backend/scripts/ops/monitorCutover.js
 * Description: Real-time monitor for read-cutover fallbacks and dual-write
 *   failures during flag rollout. Reads stdin or tails a log file.
 ********************************************************************/

'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { GROUP_ENV } = require('../../src/config/readCutoverFlags');

const WINDOW_MS = 60 * 1000;
const FALLBACK_ALERT_THRESHOLD = 3;
const REFRESH_MS = 1000;

const FALLBACK_RE = /\[READ-CUTOVER-FALLBACK\]\s+(\S+)/i;
const DUAL_WRITE_RE = /\[DUAL-WRITE-([A-Z0-9_-]+)-FAIL/i;
const TTL_RE = /\[PG-TTL-([A-Z0-9_-]+)-FAIL/i;

function parseLogfileArg() {
  const arg = process.argv.find((item) => item.startsWith('--logfile='));
  if (!arg) return null;
  const filePath = arg.slice('--logfile='.length).trim();
  return filePath ? path.resolve(process.cwd(), filePath) : null;
}

function modelKeys() {
  const keys = Object.keys(GROUP_ENV).map((group) => group.toUpperCase());
  keys.push('TTL');
  keys.push('ORDER-PARTIAL');
  keys.push('FAILURE');
  return [...new Set(keys)].sort();
}

function createStats() {
  const stats = {};
  for (const key of modelKeys()) {
    stats[key] = { fallbacks: [], dwFails: [] };
  }
  return stats;
}

function ensureModel(stats, model) {
  const key = String(model || 'UNKNOWN').toUpperCase();
  if (!stats[key]) {
    stats[key] = { fallbacks: [], dwFails: [] };
  }
  return key;
}

function pruneWindow(events, now) {
  const cutoff = now - WINDOW_MS;
  while (events.length && events[0] < cutoff) {
    events.shift();
  }
}

function recordEvent(stats, bucket, model, now = Date.now()) {
  const key = ensureModel(stats, model);
  stats[key][bucket].push(now);
  pruneWindow(stats[key][bucket], now);
}

function ingestLine(line, stats) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return;

  const now = Date.now();

  const fallbackMatch = trimmed.match(FALLBACK_RE);
  if (fallbackMatch) {
    recordEvent(stats, 'fallbacks', fallbackMatch[1], now);
    return;
  }

  const dwMatch = trimmed.match(DUAL_WRITE_RE);
  if (dwMatch) {
    recordEvent(stats, 'dwFails', dwMatch[1], now);
    return;
  }

  const ttlMatch = trimmed.match(TTL_RE);
  if (ttlMatch) {
    recordEvent(stats, 'dwFails', `TTL:${ttlMatch[1]}`, now);
  }
}

function statusForCounts(fallbacks, dwFails) {
  if (fallbacks > FALLBACK_ALERT_THRESHOLD) return '❌ ALERT';
  if (fallbacks > 0 || dwFails > 0) return '⚠️  WARN';
  return '✅ OK';
}

function collectAlerts(stats, now) {
  const alerts = [];

  for (const [model, buckets] of Object.entries(stats)) {
    pruneWindow(buckets.fallbacks, now);
    const fallbackCount = buckets.fallbacks.length;
    if (fallbackCount > FALLBACK_ALERT_THRESHOLD) {
      alerts.push(
        `⚠️  ALERT: READ-CUTOVER-FALLBACK rate high for ${model} (${fallbackCount}/min)\n` +
        `⚠️  Consider: node scripts/ops/enableFlags.js --disable=${model}`
      );
    }
  }

  return alerts;
}

function renderDashboard(stats) {
  const now = Date.now();
  const stamp = new Date(now).toLocaleTimeString('en-GB', { hour12: false });

  console.clear();
  console.log('=== Cutover health monitor ===');
  console.log(`Last updated: ${stamp}`);
  console.log('Model          | Fallbacks (1m) | DW Fails (1m) | Status');
  console.log('---------------|---------------|---------------|-------');

  const rows = Object.entries(stats)
    .map(([model, buckets]) => {
      pruneWindow(buckets.fallbacks, now);
      pruneWindow(buckets.dwFails, now);
      const fallbackCount = buckets.fallbacks.length;
      const dwCount = buckets.dwFails.length;
      return {
        model,
        fallbackCount,
        dwCount,
        status: statusForCounts(fallbackCount, dwCount),
        active: fallbackCount > 0 || dwCount > 0
      };
    })
    .filter((row) => row.active)
    .sort((a, b) => b.fallbackCount - a.fallbackCount || b.dwCount - a.dwCount);

  if (!rows.length) {
    for (const model of ['CATEGORY', 'ORDER', 'PRODUCT', 'USER']) {
      console.log(
        `${model.padEnd(14)} | ${String(0).padStart(13)} | ${String(0).padStart(13)} | ✅ OK`
      );
    }
  } else {
    for (const row of rows) {
      console.log(
        `${row.model.padEnd(14)} | ${String(row.fallbackCount).padStart(13)} | ${String(row.dwCount).padStart(13)} | ${row.status}`
      );
    }
  }

  const alerts = collectAlerts(stats, now);
  if (alerts.length) {
    console.log('\n--- Alerts ---');
    for (const alert of alerts) {
      console.log(alert);
    }
  }

  console.log('\nWatching for [READ-CUTOVER-FALLBACK], [DUAL-WRITE-*-FAIL], [PG-TTL-*-FAIL]');
  console.log('Press Ctrl+C to stop.');
}

async function monitorStdin(stats) {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => ingestLine(line, stats));

  setInterval(() => renderDashboard(stats), REFRESH_MS);
  renderDashboard(stats);
}

async function monitorLogFile(logfile, stats) {
  if (!fs.existsSync(logfile)) {
    console.error(`Log file not found: ${logfile}`);
    process.exit(1);
  }

  let offset = fs.statSync(logfile).size;

  const readNewBytes = () => {
    const currentSize = fs.statSync(logfile).size;
    if (currentSize < offset) {
      offset = 0;
    }
    if (currentSize <= offset) return;

    const stream = fs.createReadStream(logfile, { start: offset, end: currentSize - 1, encoding: 'utf8' });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) ingestLine(line, stats);
    });
    stream.on('end', () => {
      if (buffer) ingestLine(buffer, stats);
      offset = currentSize;
    });
  };

  setInterval(() => {
    try {
      readNewBytes();
      renderDashboard(stats);
    } catch (err) {
      console.error('Log read error:', err.message);
    }
  }, REFRESH_MS);

  renderDashboard(stats);
}

async function main() {
  const stats = createStats();
  const logfile = parseLogfileArg();

  if (logfile) {
    console.log(`Monitoring log file: ${logfile}`);
    await monitorLogFile(logfile, stats);
    return;
  }

  if (process.stdin.isTTY) {
    console.log('Reading from stdin — pipe app logs, e.g.:');
    console.log('  pm2 logs api --lines 0 --raw | node scripts/ops/monitorCutover.js');
    console.log('Or use --logfile=./app.log\n');
  }

  await monitorStdin(stats);
}

main().catch((err) => {
  console.error('[MONITOR-CUTOVER] Fatal error:', err);
  process.exit(1);
});
