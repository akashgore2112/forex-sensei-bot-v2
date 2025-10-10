import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/utils/env.js';
import { buildZonesTimeline } from '../src/sr/zones-timeline.js';
import { detectMR } from '../src/strategies/meanReversion/detector.js';
import { MR_CONFIG } from '../src/strategies/meanReversion/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(process.cwd(), 'cache', 'json');

const loadJSON = (name) =>
  JSON.parse(fs.readFileSync(path.join(CACHE, name), 'utf8'));

const filterRange = (arr, f, t) => {
  const from = f ? new Date(f).toISOString() : null;
  const to = t ? new Date(t).toISOString() : null;
  return arr.filter((x) => (!from || x.time >= from) && (!to || x.time <= to));
};
const mKey = (iso) => iso.slice(0, 7);

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((s) => s.split('=')));
  const symbol = (args['--symbol'] || 'EUR-USD').toUpperCase();
  const from = args['--from'];
  const to = args['--to'];
  const debug = ['1','true','on'].includes((args['--debug']||'').toLowerCase());
  const noTrend = ['1','true','on'].includes((args['--no-trend']||'').toLowerCase());

  const h4All = loadJSON(`${symbol}_4H.json`).candles;
  const h1All = loadJSON(`${symbol}_1H.json`).candles;
  const h4 = filterRange(h4All, from, to);
  const h1 = filterRange(h1All, from, to);

  const ztl = buildZonesTimeline(h4, {
    lookback: 120,
    clusterBps: 15,
    slopeBpsMax: MR_CONFIG.slopeBpsMax,
    adxTrendMax: MR_CONFIG.adxTrendMax,
  });

  if (debug) {
    const ok = ztl.filter(z => z.trendOk).length;
    const pct = ztl.length ? (ok * 100 / ztl.length).toFixed(1) : '0.0';
    console.log(`debug: zonesTimeline=${ztl.length}, trendOk=${ok} (${pct}%)`);
  }

  const signals = detectMR({ h1, zonesTimeline: ztl, cfg: MR_CONFIG, ignoreTrend: noTrend });

  const byMonth = {};
  for (const s of signals) (byMonth[mKey(s.time)] ||= []).push(s);

  console.log(`MR scan for ${symbol} ${from || ''}..${to || ''}`);
  Object.entries(byMonth).sort().forEach(([mo, arr]) => {
    const buys = arr.filter(x => x.direction === 'BUY').length;
    console.log(`  ${mo}: total=${arr.length}, BUY=${buys}, SELL=${arr.length - buys}`);
  });

  console.log('\nLast 5 signals:');
  signals.slice(-5).forEach(s => {
    console.log(`${s.time} ${s.direction} @${s.entry.toFixed(5)} SL:${s.sl} TP:${s.tp} ctx:${JSON.stringify(s.ctx)}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
