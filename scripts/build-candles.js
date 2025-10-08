// scripts/build-candles.js
// Build pipeline for DUKA: aggregate minute -> H1/H4/D1,
// sanitize, write to data/candles/duka and cache/json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { aggregateDukascopy } from '../src/data/vendors/dukascopy-aggregate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const RAW_BASE = path.join(root, 'data', 'raw', 'duka');
const CANDLES_DIR = path.join(root, 'data', 'candles', 'duka');
const CACHE_DIR = path.join(root, 'cache', 'json');

const SYMBOL_ENV = process.env.DUKA_SYMBOL || process.env.INSTRUMENT || 'EURUSD';
const SYMBOL_OUT = 'EUR-USD'; // keep same downstream shape/files
const TF_OUT = [
  { key: '1H', file: `${SYMBOL_OUT}_1H.json` },
  { key: '4H', file: `${SYMBOL_OUT}_4H.json` },
  { key: '1D', file: `${SYMBOL_OUT}_1D.json` },
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isFiniteOHLC(c) {
  return (
    c &&
    Number.isFinite(+c.time) &&
    Number.isFinite(+c.open) &&
    Number.isFinite(+c.high) &&
    Number.isFinite(+c.low) &&
    Number.isFinite(+c.close)
  );
}

function sanitize(series) {
  // drop any candle with non-finite OHLC, sort by time, de-dupe
  const clean = series.filter(isFiniteOHLC).sort((a, b) => +a.time - +b.time);
  const dedup = [];
  let lastT = null;
  for (const c of clean) {
    if (+c.time !== lastT) {
      dedup.push(c);
      lastT = +c.time;
    }
  }
  return dedup;
}

function wrap(symbol, timeframe, candles) {
  return {
    symbol,
    timeframe,
    candles,
    meta: { source: 'DUKASCOPY', generatedAt: new Date().toISOString() },
  };
}

async function main() {
  const rawDir = path.join(RAW_BASE, SYMBOL_ENV);
  ensureDir(CANDLES_DIR);
  ensureDir(CACHE_DIR);

  console.log(`[build] vendor=DUKA symbol=${SYMBOL_ENV} -> aggregate to 1H/4H/1D JSON ...`);
  const agg = await aggregateDukascopy(rawDir);

  // sanitize per TF
  const h1 = sanitize(agg.h1);
  const h4 = sanitize(agg.h4);
  const d1 = sanitize(agg.d1);

  console.log(
    `[aggregated] ok — candles: 1H=${h1.length}, 4H=${h4.length}, 1D=${d1.length}`
  );

  // write to data/candles/duka
  const outMap = {
    '1H': wrap(SYMBOL_OUT, '1H', h1),
    '4H': wrap(SYMBOL_OUT, '4H', h4),
    '1D': wrap(SYMBOL_OUT, '1D', d1),
  };

  for (const { key, file } of TF_OUT) {
    const p = path.join(CANDLES_DIR, file);
    fs.writeFileSync(p, JSON.stringify(outMap[key]));
  }

  // mirror to cache/json with same filenames used by the rest of the app
  for (const { key, file } of TF_OUT) {
    const p = path.join(CACHE_DIR, file);
    fs.writeFileSync(p, JSON.stringify(outMap[key]));
  }

  console.log('[build] done. Wrote both data/candles/duka and cache/json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
