// scripts/acceptance_summary.mjs
// Run: node scripts/acceptance_summary.mjs --csv=reports/acceptance/s3b_pairs.csv --out=reports/acceptance/s3b_summary.json

import fs from 'node:fs';

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const csvPath = arg('csv', 'reports/acceptance/s3b_pairs.csv');
const outPath = arg('out', 'reports/acceptance/s3b_summary.json');

const text = fs.readFileSync(csvPath, 'utf8').trim();
const rows = text.split(/\r?\n/).slice(1) // skip header
  .map(line => {
    const [group,symbol,trades,winPct,monthly,decision] = line.split(',');
    return {
      group, symbol,
      trades: Number(trades||0),
      winPct: Number(winPct||0),
      monthly: Number(monthly||0),
      decision: (decision||'').trim().toUpperCase()
    };
  });

// FX portfolio = only KEEP from group=fx
const keepFX = rows.filter(r => r.group==='fx' && r.decision==='KEEP');
const holdFX = rows.filter(r => r.group==='fx' && r.decision==='HOLD');
const dropFX = rows.filter(r => r.group==='fx' && r.decision==='DROP');

const totTrades = keepFX.reduce((s,r)=>s+r.trades,0);
const wins = keepFX.reduce((s,r)=>s+(r.trades*(r.winPct/100)),0);
const blendedWin = totTrades ? (100*wins/totTrades) : 0;
const monthlySum = keepFX.reduce((s,r)=>s+r.monthly,0);

const summary = {
  keepSymbols: keepFX.map(r=>r.symbol),
  holdSymbols: holdFX.map(r=>r.symbol),
  dropSymbols: dropFX.map(r=>r.symbol),
  totals: {
    keepCount: keepFX.length,
    trades_total: totTrades,
    blended_win_pct: Number(blendedWin.toFixed(2)),
    monthly_trades_sum: Number(monthlySum.toFixed(2))
  }
};

console.log('[summary] KEEP FX =', summary.keepSymbols.join(', ') || '(none)');
console.log('[summary] monthly_trades_sum ≈', summary.totals.monthly_trades_sum);
console.log('[summary] blended_win_pct ≈', summary.totals.blended_win_pct+'%');
fs.mkdirSync('reports/acceptance', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log('[summary] wrote', outPath);
