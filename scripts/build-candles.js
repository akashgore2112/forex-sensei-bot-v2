// scripts/build-candles.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/utils/env.js';

import { aggregateDukascopy } from '../src/data/vendors/dukascopy-aggregate.js';
import { ema, rsi, atr, adx } from '../src/indicators/ta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const RAW_BASE = path.join(ROOT, 'data', 'raw', 'duka');
const CANDLES_DIR = path.join(ROOT, 'data', 'candles', 'duka');
const CACHE_DIR = path.join(ROOT, 'cache', 'json');

// Inputs (either INSTRUMENTS or single INSTRUMENT)
const listFromEnv = () => {
  const multi = (process.env.INSTRUMENTS || '')
    .split(/[,\s]+/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  if (multi.length) return multi;
  const single = (process.env.INSTRUMENT || 'EURUSD').toUpperCase();
  return [single];
};

// EURUSD -> EUR-USD (BRENT stays BRENT)
const niceSymbol = s => (s.length === 6 ? `${s.slice(0,3)}-${s.slice(3)}` : s);

// ---- small utils
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function isFiniteOHLC(c) {
  return (
    c &&
    Number.isFinite(+c.open) &&
    Number.isFinite(+c.high) &&
    Number.isFinite(+c.low) &&
    Number.isFinite(+c.close) &&
    !Number.isNaN(new Date(c.time).getTime())
  );
}

function sanitize(series) {
  const iso = series.map(c => ({ ...c, time: new Date(c.time).toISOString() }));
  const clean = iso.filter(isFiniteOHLC).sort((a, b) => new Date(a.time) - new Date(b.time));
  const out = [];
  let last = null;
  for (const c of clean) {
    const t = +new Date(c.time);
    if (t !== last) {
      out.push(c);
      last = t;
    }
  }
  return out;
}

function addIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const ema20  = ema(closes, 20);
  const ema50  = ema(closes, 50);
  const rsi14  = rsi(closes, 14);
  const atr14  = atr(highs, lows, closes, 14);
  const adx14  = adx(highs, lows, closes, 14);
  return candles.map((c, i) => ({
    ...c,
    ema20: ema20[i] ?? null,
    ema50: ema50[i] ?? null,
    rsi14: rsi14[i] ?? null,
    atr14: atr14[i] ?? null,
    adx14: adx14[i] ?? null,
  }));
}

function writeJSON(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj));
  console.log('   wrote', path.relative(ROOT, file));
}

async function processSymbol(symbol) {
  const rawDir = path.join(RAW_BASE, symbol);
  const outSym = niceSymbol(symbol);

  console.log(`\n[build] ===== ${symbol} (${outSym}) =====`);
  console.log('[build] rawDir =', rawDir);

  if (!fs.existsSync(rawDir)) {
    console.warn('[build] SKIP (raw dir not found):', rawDir);
    return;
  }

  ensureDir(CANDLES_DIR);
  ensureDir(CACHE_DIR);

  console.log(`[build] vendor=DUKA symbol=${symbol} -> aggregate to 1H/4H/1D JSON ...`);
  const agg = await aggregateDukascopy(rawDir);

  const h1 = addIndicators(sanitize(agg.h1));
  const h4 = addIndicators(sanitize(agg.h4));
  const d1 = addIndicators(sanitize(agg.d1));

  console.log(`[build] counts: 1D=${d1.length}, 4H=${h4.length}, 1H=${h1.length}`);

  // data/candles/duka
  writeJSON(path.join(CANDLES_DIR, `${outSym}_1H.json`), { symbol: outSym, timeframe: '1H', candles: h1 });
  writeJSON(path.join(CANDLES_DIR, `${outSym}_4H.json`), { symbol: outSym, timeframe: '4H', candles: h4 });
  writeJSON(path.join(CANDLES_DIR, `${outSym}_1D.json`), { symbol: outSym, timeframe: '1D', candles: d1 });

  // cache/json (mirror)
  writeJSON(path.join(CACHE_DIR, `${outSym}_1H.json`), { symbol: outSym, timeframe: '1H', candles: h1 });
  writeJSON(path.join(CACHE_DIR, `${outSym}_4H.json`), { symbol: outSym, timeframe: '4H', candles: h4 });
  writeJSON(path.join(CACHE_DIR, `${outSym}_1D.json`), { symbol: outSym, timeframe: '1D', candles: d1 });

  console.log('[build] done for', symbol);
}

async function main() {
  const symbols = listFromEnv();
  console.log('[build] symbols =', symbols.join(', '));
  for (const s of symbols) {
    // serial for low-RAM environments
    await processSymbol(s);
  }
  console.log('\n[build] all symbols complete ✓');
}

main().catch(e => {
  console.error('[build] FATAL', e);
  process.exit(1);
});
