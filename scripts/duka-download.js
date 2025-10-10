// scripts/duka-download.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/env.js'; // load .env if present

// ---- Env & defaults
const INSTR = (process.env.INSTRUMENT || 'EURUSD').toLowerCase(); // dukascopy style expects lower for CLI
const FROM_M = process.env.DUKA_FROM_MONTH || '2023-01';
const TO_M   = process.env.DUKA_TO_MONTH   || '2025-12';
const TF     = process.env.DUKA_TIMEFRAME  || 'm1';
const PRICE_FMT = 'csv';

// Output base per symbol (UPPER for folder name)
const ROOT = process.cwd();
const OUT_BASE = path.join(ROOT, 'data', 'raw', 'duka', INSTR.toUpperCase());

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function* monthRangeInclusive(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split('-').map(Number);
  const [ty, tm] = toYYYYMM.split('-').map(Number);
  let y = fy, m = fm;
  // yield until we pass end
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, '0')}`;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

function monthBounds(ym) {
  // yyyy-mm to first/last day
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
  const to   = new Date(Date.UTC(y, m, 0, 23, 59, 59, 0)).toISOString(); // last day 23:59:59Z
  return { from, to };
}

function runNpx(args, opts = {}) {
  return execFileSync('npx', args, { stdio: 'inherit', ...opts });
}

(async function main() {
  console.log(`Downloading ${INSTR} ${TF} ${FROM_M}..${TO_M} → ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  for (const ym of monthRangeInclusive(FROM_M, TO_M)) {
    const { from, to } = monthBounds(ym);
    const outDir = path.join(OUT_BASE, ym);
    ensureDir(outDir);

    // Skip if monthly file already exists (dukascopy-node writes one CSV per request)
    const monthCsv = path.join(outDir,
      `${INSTR}-${TF}-bid-${ym}-01-${ym}-${String(new Date(to).getUTCDate()).padStart(2, '0')}.csv`);
    // We cannot rely on exact filename shape; do a loose existence check:
    const already = fs.readdirSync(outDir).some(f => f.endsWith('.csv'));
    if (already) {
      console.log(`↷ ${ym}: already has CSV → skip`);
      continue;
    }

    console.log(`\n→ downloading ${INSTR} ${ym} into ${outDir}`);
    try {
      // Primary: dukascopy-node
      const args = [
        '--yes', 'dukascopy-node@latest',
        '--instrument', INSTR,
        '--timeframe', TF,
        '--date-from', from,
        '--date-to', to,
        '--format', PRICE_FMT,
        '--directory', outDir,
      ];
      runNpx(args);
    } catch (e) {
      console.log("dukascopy-node failed, trying dukascopy-cli …");
      const alt = [
        '--yes', 'dukascopy-cli@latest',
        '--instrument', INSTR,
        '--timeframe', TF,
        '--date-from', from,
        '--date-to', to,
        '--format', PRICE_FMT,
        '--directory', outDir,
      ];
      runNpx(alt);
    }
  }

  console.log('\n✓ Duka download complete.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
