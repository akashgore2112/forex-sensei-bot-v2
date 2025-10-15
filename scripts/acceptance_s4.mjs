// scripts/acceptance_s4.mjs  (ESM)
// Run: node scripts/acceptance_s4.mjs --symbols="EUR-USD,GBP-USD,USD-JPY,..." --from-days=400 --out reports/acceptance/s3b_pairs.csv

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function parseArg(name, def) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : def;
}

const symbolsCsv = parseArg('symbols', '').trim();
if (!symbolsCsv) {
  console.error('Usage: --symbols="EUR-USD,GBP-USD,..." --from-days=400 [--out=reports/acceptance/s3b_pairs.csv]');
  process.exit(1);
}
const symbols = symbolsCsv.split(',').map(s => s.trim()).filter(Boolean);
const fromDays = Number(parseArg('from-days', '400'));
const out = parseArg('out', 'reports/acceptance/s3b_pairs.csv');

// Acceptance rules (FX)
function decideFX(trades, win) {
  if (trades >= 20 && win >= 55) return 'KEEP';
  if (trades >= 18 && win >= 52) return 'HOLD';
  return 'DROP';
}

const monthsApprox = fromDays / 30.4;

fs.mkdirSync('reports/acceptance', { recursive: true });

const rows = [];
rows.push('group,symbol,trades_total,winRate_S4_pct,monthly_trades,decision,notes');

for (const sym of symbols) {
  const bt = spawnSync('node', ['scripts/backtest-mr.js', `--symbol=${sym}`, `--from-days=${fromDays}`, '--no-trend=1'], { encoding: 'utf8' });

  if (bt.status !== 0) {
    console.error(`[acceptance] backtest failed for ${sym}`, bt.stderr);
    rows.push(`fx,${sym},,, ,ERROR,backtest failed`);
    continue;
  }

  const outText = bt.stdout;

  // Parse trades (pick the last "trades=" occurrence) and winRate
  let trades = 0;
  const tradeMatches = [...outText.matchAll(/trades\s*=\s*(\d+)/g)];
  if (tradeMatches.length) trades = Number(tradeMatches.at(-1)[1]);

  const winMatch = outText.match(/winRate\s*=\s*([\d.]+)%/);
  const win = winMatch ? Number(winMatch[1]) : 0;

  const monthly = trades ? (trades / monthsApprox) : 0;
  const decision = decideFX(trades, win);

  rows.push([
    'fx',
    sym,
    trades || '',
    win || '',
    monthly ? monthly.toFixed(2) : '',
    decision,
    ''
  ].join(','));

  console.log(`[S4] ${sym}: trades=${trades}, winRate=${win}%, monthly≈${monthly.toFixed(2)} -> ${decision}`);
}

fs.writeFileSync(out, rows.join('\n'));
console.log(`\n[acceptance] wrote ${out} (${symbols.length} rows)`);
