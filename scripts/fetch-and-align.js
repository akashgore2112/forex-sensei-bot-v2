import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchCandles } from '../src/data/twelvedata-adapter.js';
import { alignSeries } from '../src/data/aligner.js';
import { requireEnv } from '../src/utils/env.js';
import { rsi, atr, adx, ema } from '../src/indicators/ta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // <= is line se pehle ek blank line ho


function saveJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function run() {
  requireEnv(['TWELVEDATA_API_KEY']);
  const symbol = process.env.SYMBOLS?.split(',')[0]?.trim() || 'EUR/USD';
  const startDate = daysAgo(365 * 2 + 10);
  const endDate = daysAgo(0);

  console.log('Fetching', { symbol, startDate, endDate });

  const frames = ['1D', '4H', '1H'];
  const out = {};

  for (const tf of frames) {
    const raw = await fetchCandles({ symbol, timeframe: tf, startDate, endDate });
    const { candles, gaps } = alignSeries(raw, tf);

    // indicators
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const atr14 = atr(highs, lows, closes, 14);
    const adx14 = adx(highs, lows, closes, 14);

    out[tf] = { count: candles.length, gaps: gaps.length };

    const store = candles.map((c, i) => ({
      ...c,
      ema20: ema20[i] ?? null,
      ema50: ema50[i] ?? null,
      rsi14: rsi14[i] ?? null,
      atr14: atr14[i] ?? null,
      adx14: adx14[i] ?? null,
    }));

    const p = path.resolve(__dirname, `../cache/json/${symbol.replace('/', '-')}_${tf}.json`);
    saveJSON(p, { symbol, timeframe: tf, candles: store, meta: { gaps } });
  }

  console.log('Summary:', out);
}

run().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
