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

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((s) => s.split('=')));
  const symbol = (args['--symbol'] || 'EUR-USD').toUpperCase();
  const from = args['--from'];
  const to = args['--to'];

  const h4All = loadJSON(`${symbol}_4H.json`).candles;
  const h1All = loadJSON(`${symbol}_1H.json`).candles;
  const h4 = filterRange(h4All, from, to);
  const h1 = filterRange(h1All, from, to);

  // rolling zones + trend guard thresholds from MR_CONFIG
  const ztl = buildZonesTimeline(h4, {
    lookback: 120,
    clusterBps: 15,
    slopeBpsMax: MR_CONFIG.slopeBpsMax,
    adxTrendMax: MR_CONFIG.adxTrendMax,
  });

  const signals = detectMR({ h1, zonesTimeline: ztl });

  const { trades, stats } = backtestMR(h1, signals, { maxBars: 240 });
  console.log(`MR Backtest ${symbol} ${from || ''}..${to || ''}`);
  console.log(`signals=${signals.length}, trades=${trades.length}`);
  console.log(
    `wins=${stats.wins}, losses=${stats.losses}, winRate=${stats.winRate.toFixed(
      1,
    )}%`,
  );
  console.log(
    `avgR=${stats.avgR.toFixed(2)}, expectancy(R)=${stats.expectancy.toFixed(
      2,
    )}, avgHoldHrs=${stats.avgHoldHrs.toFixed(1)}`,
  );

  console.log('\nLast 5 trades:');
  trades.slice(-5).forEach((t) => {
    console.log(
      `${t.time} ${t.direction} entry=${t.entry.toFixed(5)} exit=${t.exit.toFixed(
        5,
      )} outcome=${t.outcome} R=${t.R.toFixed(2)} bars=${t.holdBars}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
