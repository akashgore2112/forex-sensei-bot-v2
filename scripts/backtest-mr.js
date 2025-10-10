import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/utils/env.js';
import { buildZones4H } from '../src/sr/range-levels.js';
import { detectMR } from '../src/strategies/meanReversion/detector.js';
import { backtestMR } from '../backtests/mr-backtest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(process.cwd(), 'cache', 'json');

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(CACHE, name), 'utf8'));
}
function filterRange(arr, fromISO, toISO) {
  const f = fromISO ? new Date(fromISO).toISOString() : null;
  const t = toISO   ? new Date(toISO).toISOString()   : null;
  return arr.filter(c => (!f || c.time >= f) && (!t || c.time <= t));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => s.split('=')));
  const symbol = (args['--symbol'] || 'EUR-USD').toUpperCase();
  const from = args['--from']; const to = args['--to'];

  const h4 = filterRange(loadJSON(`${symbol}_4H.json`).candles, from, to);
  const h1 = filterRange(loadJSON(`${symbol}_1H.json`).candles, from, to);

  const zones = buildZones4H(h4, { lookback: 120, clusterBps: 15 });
  const signals = detectMR({ h1, zones });

  const { trades, stats } = backtestMR(h1, signals, { maxBars: 240 }); // upto 10 days
  console.log(`MR Backtest ${symbol} ${from || ''}..${to || ''}`);
  console.log(`signals=${signals.length}, trades=${trades.length}`);
  console.log(`wins=${stats.wins}, losses=${stats.losses}, winRate=${stats.winRate.toFixed(1)}%`);
  console.log(`avgR=${stats.avgR.toFixed(2)}, expectancy(R)=${stats.expectancy.toFixed(2)}, avgHoldHrs=${stats.avgHoldHrs.toFixed(1)}`);

  // last 5 trades preview
  console.log('\nLast 5 trades:');
  trades.slice(-5).forEach(t=>{
    console.log(`${t.time} ${t.direction} entry=${t.entry.toFixed(5)} exit=${t.exit.toFixed(5)} outcome=${t.outcome} R=${t.R.toFixed(2)} bars=${t.holdBars}`);
  });
}

main().catch(e=>{ console.error(e); process.exit(1); });
