// scripts/duka-download.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/env.js';

const INSTR = (process.env.INSTRUMENT || 'EURUSD').toLowerCase();
const FROM_M = process.env.DUKA_FROM_MONTH || '2023-01';
const TO_M   = process.env.DUKA_TO_MONTH   || '2025-12';
const TF     = process.env.DUKA_TIMEFRAME  || 'm1';

const ROOT = process.cwd();
const OUT_BASE = path.join(ROOT, 'data', 'raw', 'duka', 'EURUSD');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function* monthsRange(fromYyyyMm, toYyyyMm) {
  let [y, m] = fromYyyyMm.split('-').map(Number);
  const [ty, tm] = toYyyyMm.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, '0')}`;
    m++; if (m > 12) { m = 1; y++; }
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function guessMonthFilename(month) {
  // what both CLIs typically generate
  return `${INSTR}-m1-bid-${month}-01-${month}-${new Date(`${month}-01`).toISOString().slice(0,7)}-${new Date(new Date(`${month}-01`).getFullYear(), new Date(`${month}-01`).getMonth()+1, 0).getDate()}.csv`
    .replace(/-\d{4}-\d{2}-/, '-'); // normalize mid part; we’ll glob anyway
}

function moveIfDroppedInCwd(outDir, month) {
  // If CLI ignored --directory and dropped the file in CWD, move it.
  const prefix = `${INSTR}-m1-bid-${month}-`;
  const candidates = fs.readdirSync(process.cwd()).filter(f => f.startsWith(prefix) && f.endsWith('.csv'));
  for (const f of candidates) {
    const src = path.join(process.cwd(), f);
    const dst = path.join(outDir, f);
    if (!fs.existsSync(dst)) {
      try { fs.renameSync(src, dst); } catch { /* ignore */ }
    }
  }
}

async function main() {
  console.log(`Symbol: ${INSTR}, tf: ${TF}, months: ${FROM_M}..${TO_M}`);
  for (const month of monthsRange(FROM_M, TO_M)) {
    const outDir = path.join(OUT_BASE, month);
    ensureDir(outDir);

    const from = `${month}-01`;
    // to = last day of month
    const dt = new Date(`${month}-01T00:00:00Z`);
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth()+1, 0));
    const to = `${last.toISOString().slice(0,10)}`;

    console.log(`\n>> downloading ${INSTR} ${month} -> ${outDir}`);
    try {
      // Primary: dukascopy-node CLI (NO --concurrency)
      run('npx', [
        '--yes', 'dukascopy-node@latest',
        '--instrument', INSTR,
        '--timeframe', TF,
        '--date-from', from,
        '--date-to', to,
        '--format', 'csv',
        '--directory', outDir
      ]);
    } catch (e) {
      console.log('dukascopy-node failed, trying dukascopy-cli …');
      // Fallback: dukascopy-cli (same flags)
      run('npx', [
        '--yes', 'dukascopy-cli@latest',
        '--instrument', INSTR,
        '--timeframe', TF,
        '--date-from', from,
        '--date-to', to,
        '--format', 'csv',
        '--directory', outDir
      ]);
      moveIfDroppedInCwd(outDir, month);
    }
  }
  console.log('\n✓ Duka download complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
