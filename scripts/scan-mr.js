import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/utils/env.js';
import { buildZones4H } from '../src/sr/range-levels.js';
import { detectMR } from '../src/strategies/meanReversion/detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(process.cwd(), 'cache', 'json');

function loadJSON(name) {
  const p = path.join(CACHE, name);
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
function withinRange(arr, fromISO, toISO) {
  if (!fromISO && !toISO) return arr;
  const from = fromISO ? new Date(fromISO).toISOString() : null;
  const to   = toISO   ? new Date(toISO).toISOString()   : null;
  return arr.filter(c => (!from || c.time >= from) && (!to || c.time <= to));
}

function monthKey(iso) { return iso.slice(0,7); }

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => s.split('=')));
  const symbol = (args['--symbol'] || 'EUR-USD').toUpperCase();
  const from = args['--from'];
  const to   = args['--to'];

  const h4 = withinRange(loadJSON(`${symbol}_4H.json`).candles, from, to);
  const h1 = withinRange(loadJSON(`${symbol}_1H.json`).candles, from, to);

  const zones = buildZones4H(h4, { lookback: 120, clusterBps: 15 });
  const signals = detectMR({ h1, zones });

  // group per month
  const byMonth = {};
  for (const s of signals) {
    const k = monthKey(s.time);
    byMonth[k] = byMonth[k] || [];
    byMonth[k].push(s);
  }

  console.log(`MR scan for ${symbol} ${from || ''}..${to || ''}`);
  Object.entries(byMonth).sort().forEach(([m, arr]) => {
    const buys = arr.filter(x=>x.direction==='BUY').length;
    const sells = arr.length - buys;
    console.log(`  ${m}: total=${arr.length}, BUY=${buys}, SELL=${sells}`);
  });

  // preview last 5
  console.log('\nLast 5 signals:');
  signals.slice(-5).forEach(s=>{
    console.log(`${s.time} ${s.direction} @${s.entry.toFixed(5)} SL:${s.sl} TP:${s.tp} ctx:${JSON.stringify(s.ctx)}`);
  });
}

main().catch(e=>{ console.error(e); process.exit(1); });
