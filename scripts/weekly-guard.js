// scripts/weekly-guard.js
// Health check over last N months using S4 (no-trend)

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SYMBOLS = (process.env.SYMBOLS || 'EUR-USD,GBP-USD,USD-JPY')
  .split(',').map(s => s.trim()).filter(Boolean);

const months = Number(process.env.MONTHS || 6);
const today = new Date();
const toStr = today.toISOString().slice(0, 10);
const from = new Date(today);
from.setMonth(from.getMonth() - months);
const fromStr = from.toISOString().slice(0, 10);

const outDir = path.join('reports', 'health');
ensureDir(outDir);
const weekTag = isoWeekTag(today);
const outFile = path.join(outDir, `health_${weekTag}.json`);

const results = [];
for (const sym of SYMBOLS) {
  const r = runS4(sym, fromStr, toStr);
  const parsed = parseBacktest(r.stdout);
  const status = classify(parsed.winRate, parsed.trades);
  results.push({ symbol: sym, from: fromStr, to: toStr, ...parsed, status });
  console.log(`${sym}: trades=${parsed.trades} winRate=${parsed.winRate}% expR=${parsed.expectancyR} -> ${status}`);
}

fs.writeFileSync(outFile, JSON.stringify({
  week: weekTag,
  generatedAt: new Date().toISOString(),
  window: { from: fromStr, to: toStr },
  thresholds: { minTrades: 10, minWin: 55 },
  results
}, null, 2));
console.log(`\nHealth report written: ${outFile}`);

function runS4(symbol, from, to) {
  const args = ['scripts/backtest-mr.js', `--symbol=${symbol}`, `--from=${from}`, `--to=${to}`, '--no-trend=1'];
  const out = spawnSync('node', args, { encoding: 'utf8' });
  if (out.error) throw out.error;
  return { stdout: out.stdout || '', stderr: out.stderr || '' };
}

function parseBacktest(text) {
  // Try to read "trades=" and "winRate=xx.x%" and "expectancy(R)=x.xx"
  const trades = firstNum(text.match(/trades\s*=\s*(\d+)/i));
  const win = firstNum(text.match(/winRate\s*=\s*([\d.]+)/i));
  const exp = firstNum(text.match(/expectancy\(R\)\s*=\s*([-.\d]+)/i));
  return { trades: trades ?? 0, winRate: win ?? 0, expectancyR: exp ?? 0 };
}
function firstNum(m) { return m ? Number(m[1]) : null; }

function classify(win, trades) {
  if (trades >= 10 && win >= 55) return 'OK';
  if ((trades >= 6 && trades < 10) || (win >= 50 && win < 55)) return 'BORDERLINE';
  return 'PAUSE-SYMBOL';
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function isoWeekTag(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday week-numbering year
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const y = date.getUTCFullYear();
  return `${y}-W${String(weekNo).padStart(2, '0')}`;
}
