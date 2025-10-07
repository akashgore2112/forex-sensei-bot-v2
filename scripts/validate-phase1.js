import fs from 'fs';
import path from 'path';

const files = [
  'cache/json/EUR-USD_1D.json',
  'cache/json/EUR-USD_4H.json',
  'cache/json/EUR-USD_1H.json'
];

function checkFile(p) {
  if (!fs.existsSync(p)) throw new Error('Missing file: ' + p);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(j.candles) || j.candles.length < 100)
    throw new Error('Low candle count: ' + p);

  // basic indicator sanity after warmup (index 60)
  const idx = 60;
  const c = j.candles[idx];
  if ([c.ema20, c.ema50, c.rsi14, c.atr14, c.adx14].some(v => v == null || Number.isNaN(v)))
    throw new Error('Indicators NaN at index ~60 in ' + p);

  return { file: p, count: j.candles.length, gaps: j.meta?.gaps?.length ?? 0 };
}

const out = files.map((f) => checkFile(path.resolve(process.cwd(), f)));
console.log('Phase 1 validate ✅', out);
