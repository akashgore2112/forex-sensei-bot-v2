// scripts/duka-download.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/env.js';

const ROOT = process.cwd();
const PRICE_FMT = 'csv';

const INSTR = (process.env.INSTRUMENT || 'EURUSD').toLowerCase();
const FROM_M = process.env.DUKA_FROM_MONTH || '2023-01';
const TO_M   = process.env.DUKA_TO_MONTH   || '2025-12';
const TF     = process.env.DUKA_TIMEFRAME  || 'm1';

// put files under data/raw/duka/<SYMBOL>/
const OUT_BASE = path.join(ROOT, 'data', 'raw', 'duka', INSTR.toUpperCase());
fs.mkdirSync(OUT_BASE, { recursive: true });

function monthRange(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const list = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    list.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m === 13) { m = 1; y++; }
  }
  return list;
}

for (const ym of monthRange(FROM_M, TO_M)) {
  const [y, m] = ym.split('-');
  const outDir = path.join(OUT_BASE, `${y}-${m}`);
  fs.mkdirSync(outDir, { recursive: true });

  const from = `${ym}-01`;
  // end-of-month: use a small trick → next month - 1 day
  const end = new Date(`${ym}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const to = end.toISOString().slice(0, 10);

  // skip if file exists (dukascopy-node creates one per month)
  const monthFilePrefix = `${INSTR}-${TF}-bid-${from.replace(/-/g, '-')}-${to.replace(/-/g, '-')}.csv`;
  const existing = fs.readdirSync(outDir).find(f => f.endsWith('.csv'));
  if (existing) {
    console.log(`${ym}: already has CSV  -  skip`);
    continue;
  }

  // primary: dukascopy-node (npx)
  const args = [
    '--yes', 'dukascopy-node@latest',
    '--instrument', INSTR,
    '--timeframe', TF,
    '--date-from', from,
    '--date-to', to,
    '--format', PRICE_FMT,
    '--directory', outDir,
  ];

  try {
    execFileSync('npx', args, { stdio: 'inherit' });
  } catch {
    console.log('dukascopy-node failed, trying dukascopy-cli …');
    // fallback: dukascopy-cli
    const alt = [
      '--yes', 'dukascopy-cli@latest',
      '--instrument', INSTR,
      '--timeframe', TF,
      '--date-from', from,
      '--date-to', to,
      '--format', PRICE_FMT,
      '--directory', outDir,
    ];
    execFileSync('npx', alt, { stdio: 'inherit' });
  }
}

console.log('\n✓ Duka download complete.');
