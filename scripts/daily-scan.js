// scripts/daily-scan.js  (ESM)
// Daily multi-symbol scan + backtests + artifacts + de-dup

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TODAY = new Date();
const yyyy = TODAY.toISOString().slice(0, 10); // YYYY-MM-DD

// ENV
const SYMBOLS = (process.env.SYMBOLS || 'EUR-USD,GBP-USD,USD-JPY')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const FROM_DAYS = Number(process.env.FROM_DAYS || 400);
const FROM = new Date(TODAY.getTime() - FROM_DAYS * 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);

// Paths
const LOG_DIR = path.resolve('logs');
const LOG_FILE = path.join(LOG_DIR, `daily_${yyyy}.txt`);
const REP_ROOT = path.resolve('reports', 'daily');
const REP_TODAY = path.join(REP_ROOT, yyyy);
const LAST_DIR = path.join(REP_ROOT, '.last');

// Helpers
async function ensureDirs() {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  await fsp.mkdir(REP_TODAY, { recursive: true });
  await fsp.mkdir(LAST_DIR, { recursive: true });
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  const out = (res.stdout || '') + (res.stderr || '');
  return { code: res.status ?? 0, out };
}

function append(file, text) {
  fs.appendFileSync(file, text, 'utf8');
}

function write(file, text) {
  fs.writeFileSync(file, text, 'utf8');
}

function symFile(sym) {
  // safe file part for a symbol (EUR-USD -> EUR-USD)
  return sym.replace(/[^\w.-]+/g, '-');
}

// crude parse: try to capture latest ISO date in the "Last 5 signals" block
function extractLatestTs(scanText) {
  // look for ISO like 2025-09-15T00:00:00.000Z or 2025-09-15T00:00:00.000Z
  const isoRe = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
  let latest = null;
  for (const m of scanText.matchAll(isoRe)) {
    latest = m[0]; // last match will be the latest printed
  }
  return latest;
}

async function main() {
  await ensureDirs();

  const header = `[daily-scan] ${yyyy} symbols=${SYMBOLS.join(', ')} window ${FROM}..${yyyy}\n`;
  append(LOG_FILE, header);
  console.log(header.trim());

  const digestLines = [];
  for (const sym of SYMBOLS) {
    const fileBase = symFile(sym);

    // --- de-dup marker (read)
    let lastMarker = null;
    const lastPath = path.join(LAST_DIR, `${fileBase}.json`);
    if (fs.existsSync(lastPath)) {
      try { lastMarker = JSON.parse(fs.readFileSync(lastPath, 'utf8')); } catch {}
    }

    // --- S2: scan
    const s2 = run('node', ['scripts/scan-mr.js', `--symbol=${sym}`, `--from=${FROM}`, `--to=${yyyy}`, '--debug=1']);
    append(LOG_FILE, `\n== ${sym}: S2 scan ==\n` + s2.out + '\n');

    // latestTs from scan output (for de-dup)
    const latestTs = extractLatestTs(s2.out);

    // de-dup: if no new signals compared to .last, skip artifact write (still run S3/S4 for safety)
    let willWrite = true;
    if (lastMarker?.latestTs && latestTs && lastMarker.latestTs === latestTs) {
      willWrite = false;
      append(LOG_FILE, `-- ${sym}: no new (latest already emitted ${latestTs})\n`);
      console.log(`${sym}: no new (latest already emitted ${latestTs})`);
    }

    // --- S3: backtest (trend ON)
    const s3 = run('node', ['scripts/backtest-mr.js', `--symbol=${sym}`, `--from=${FROM}`, `--to=${yyyy}`]);
    append(LOG_FILE, `\n== ${sym}: S3 backtest (trend ON) ==\n` + s3.out + '\n');

    // --- S4: backtest (trend OFF)
    const s4 = run('node', ['scripts/backtest-mr.js', `--symbol=${sym}`, `--from=${FROM}`, `--to=${yyyy}`, '--no-trend=1']);
    append(LOG_FILE, `\n== ${sym}: S4 backtest (trend OFF) ==\n` + s4.out + '\n');

    // --- artifacts (only if new)
    if (willWrite) {
      const scanTxt = path.join(REP_TODAY, `scan_${fileBase}.txt`);
      const sigJson = path.join(REP_TODAY, `signals_${fileBase}.json`);

      // minimal signal JSON (add more fields if needed later)
      const payload = {
        symbol: sym,
        runAt: new Date().toISOString(),
        window: { from: FROM, to: yyyy },
        latestTs: latestTs || null,
        notes: 'S2/S3/S4 raw outputs are stored in per-day log and scan_*.txt',
      };

      write(scanTxt, s2.out);
      write(sigJson, JSON.stringify(payload, null, 2));
      write(lastPath, JSON.stringify({ latestTs: payload.latestTs, updatedAt: payload.runAt }, null, 2));
      append(LOG_FILE, `-- ${sym}: wrote artifacts -> ${path.relative(process.cwd(), REP_TODAY)}/scan_${fileBase}.txt , signals_${fileBase}.json\n`);
      console.log(`${sym}: wrote artifacts`);
    }

    // digest line (rough win-rate extraction from backtest text)
    const wrRe = /winRate\s*=\s*([0-9.]+)%/i;
    const wrOn = (s3.out.match(wrRe) || [,'?'])[1];
    const wrOff = (s4.out.match(wrRe) || [,'?'])[1];
    digestLines.push(`${sym}: winRate ON=${wrOn}% | OFF=${wrOff}%`);
  }

  // digest
  const digest = [
    `daily digest — ${yyyy}`,
    `symbols: ${SYMBOLS.join(', ')}`,
    `window: ${FROM} .. ${yyyy}`,
    ...digestLines,
    ''
  ].join('\n');

  write(path.join(REP_TODAY, 'digest.txt'), digest);
  append(LOG_FILE, `\n----- DIGEST -----\n${digest}\n`);

  console.log(`[daily-scan] done -> ${LOG_FILE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
