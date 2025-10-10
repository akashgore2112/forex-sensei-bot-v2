// scripts/backtest-mr.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/utils/env.js';
import { buildZonesTimeline } from '../src/sr/zones-timeline.js';
import { detectMR } from '../src/strategies/meanReversion/detector.js';
import { backtestMR } from '../backtests/mr-backtest.js';
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

function parseArgs(argv) {
  const kv = Object.fromEntries(
    argv.slice(2).map((s) => {
      const [k, v] = s.split('=');
      return [k, v === undefined ? '1' : v];
    })
  );
  const normBool = (x) => ['1','true','on','yes'].includes(String(x).toLowerCase());
  return {
    symbol: (kv['--symbol'] || 'EUR-USD').toUpperCase(),
    from: kv['--from'],
    to: kv['--to'],
    noTrend: normBool(kv['--no-trend']),
    timeoutBars: kv['--timeoutBars'] ? Number(kv['--timeoutBars']) : Number(MR_CONFIG.timeoutBars) || 240,
    debug: normBool(kv['--debug'])
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const h4All = loadJSON(`${args.symbol}_4H.json`).candles;
  const h1All = loadJSON(`${args.symbol}_1H.json`).candles;
  const h4 = filterRange(h4All, args.from, args.to);
  const h1 = filterRange(h1All, args.from, args.to);

  const ztl = buildZonesTimeline(h4, {
    lookback: 120,
    clusterBps: 15,
    slopeBpsMax: MR_CONFIG.slopeBpsMax,
    adxTrendMax: MR_CONFIG.adxTrendMax,
  });

  const signals = detectMR({
    h1,
    zonesTimeline: ztl,
    cfg: MR_CONFIG,
    ignoreTrend: args.noTrend,
  });

  const { trades, stats } = backtestMR(h1, signals, { maxBars: args.timeoutBars, slBufferBps: MR_CONFIG.slBufferBps });

  console.log(
    `MR Backtest ${args.symbol} ${args.from || ''}..${args.to || ''} (timeout=${args.timeoutBars} bars, trend=${args.noTrend ? 'OFF' : 'ON'})`
  );
  console.log(`signals=${signals.length}, trades=${trades.length}`);
  console.log(
    `wins=${stats.wins}, losses=${stats.losses}, winRate=${stats.winRate.toFixed(1)}%`
  );
  console.log(
    `avgR=${stats.avgR.toFixed(2)}, expectancy(R)=${stats.expectancy.toFixed(2)}, avgHoldHrs=${stats.avgHoldHrs.toFixed(1)}`
  );

  if (args.debug) {
    console.log('\nDEBUG cfg:', {
      rsiLow: MR_CONFIG.rsiLow,
      rsiHigh: MR_CONFIG.rsiHigh,
      levelTolBps: MR_CONFIG.levelTolBps,
      retestBars: MR_CONFIG.retestBars,
      retestTolBps: MR_CONFIG.retestTolBps,
      confirmCloseAwayBps: MR_CONFIG.confirmCloseAwayBps,
      adxMax: MR_CONFIG.adxMax,
      atrSL: MR_CONFIG.atrSL,
      rr: MR_CONFIG.rr,
      timeoutBars: args.timeoutBars,
    });
  }

  console.log('\nLast 5 trades:');
  trades.slice(-5).forEach((t) => {
    console.log(
      `${t.time} ${t.direction} entry=${t.entry.toFixed(5)} exit=${t.exit.toFixed(5)} outcome=${t.outcome} R=${t.R.toFixed(2)} bars=${t.holdBars}`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
