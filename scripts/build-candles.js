# FILE: scripts/build-candles.js
# PURPOSE: build 1H/4H/1D JSON for either a single symbol (SYMBOL_ENV),
#          or a default list (FX), and it now also supports commodities like BRENT.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/utils/env.js';                       // load .env
import { aggregateDukascopy } from '../src/data/vendors/dukascopy-aggregate.js';
import { ema, rsi, atr, adx } from '../src/indicators/ta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT         = path.join(__dirname, '..');
const RAW_BASE     = path.join(ROOT, 'data', 'raw', 'duka');       // data/raw/duka/<SYMBOL>/{YYYY-MM}/...
const CANDLES_DIR  = path.join(ROOT, 'data', 'candles', 'duka');
const CACHE_DIR    = path.join(ROOT, 'cache', 'json');

// default FX universe (when SYMBOL_ENV is not provided)
const FX_UNIVERSE = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','EURJPY','GBPJPY','NZDUSD'];
// commodities we currently know; extend as needed
const COMMODS     = ['BRENT'];  // folder: data/raw/duka/BRENT/*  (CSV like brentcmd-usd-*.csv)

// resolve wanted symbols
const ONE = (process.env.SYMBOL_ENV || '').trim().toUpperCase();
const WANTED = ONE ? [ONE] : FX_UNIVERSE;

// ensure folders
function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, {recursive:true}); }

function isFiniteOHLC(c){
  return (
    c &&
    Number.isFinite(Number(new Date(c.time))) &&   // ISO time after we convert
    Number.isFinite(+c.open) &&
    Number.isFinite(+c.high) &&
    Number.isFinite(+c.low)  &&
    Number.isFinite(+c.close)
  );
}

function sanitize(series){
  // convert epoch-ms → ISO, sort, de-dup
  const iso = series.map(c => ({ ...c, time: new Date(Number(c.time)).toISOString() }));
  const clean = iso.filter(isFiniteOHLC).sort((a,b) => new Date(a.time) - new Date(b.time));
  const out = [];
  let lastT = -1;
  for(const c of clean){
    const t = +new Date(c.time);
    if(t !== lastT){ out.push(c); lastT = t; }
  }
  return out;
}

function addIndicators(list){
  const closes = list.map(c=>c.close);
  const highs  = list.map(c=>c.high);
  const lows   = list.map(c=>c.low);

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(highs, lows, closes, 14);
  const adx14 = adx(highs, lows, closes, 14);

  return list.map((c,i)=>({
    ...c,
    ema20: ema20[i] ?? null,
    ema50: ema50[i] ?? null,
    rsi14: rsi14[i] ?? null,
    atr14: atr14[i] ?? null,
    adx14: adx14[i] ?? null,
  }));
}

function writeJSON(fp, obj){
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, JSON.stringify(obj), 'utf8');
  console.log('  wrote', fp);
}

async function buildOne(symbol){
  const rawDir = path.join(RAW_BASE, symbol);
  if(!fs.existsSync(rawDir)){
    console.log(`[build] skip ${symbol} — raw dir not found: ${rawDir}`);
    return;
  }

  console.log(`\n[build] ===== ${symbol} =====`);
  console.log('[build]  rawDir =', rawDir);

  ensureDir(CANDLES_DIR);
  ensureDir(CACHE_DIR);

  // aggregate m1 CSV → H1/H4/D1 arrays (with epoch times)
  const agg = await aggregateDukascopy(rawDir);

  // clean + indicators
  const H1 = addIndicators(sanitize(agg.h1));
  const H4 = addIndicators(sanitize(agg.h4));
  const D1 = addIndicators(sanitize(agg.d1));

  // output file names (consistent with existing convention)
  const base = symbol.includes('-') ? symbol : symbol.replace(/([A-Z]{3})([A-Z]{3})/, '$1-$2'); // EURUSD→EUR-USD ; BRENT stays BRENT
  const f1 = path.join(CANDLES_DIR,     `${base}_1H.json`);
  const f4 = path.join(CANDLES_DIR,     `${base}_4H.json`);
  const fD = path.join(CANDLES_DIR,     `${base}_1D.json`);
  const c1 = path.join(CACHE_DIR,       `${base}_1H.json`);
  const c4 = path.join(CACHE_DIR,       `${base}_4H.json`);
  const cD = path.join(CACHE_DIR,       `${base}_1D.json`);

  writeJSON(f1, { symbol: base, timeframe:'1H', candles:H1 });
  writeJSON(f4, { symbol: base, timeframe:'4H', candles:H4 });
  writeJSON(fD, { symbol: base, timeframe:'1D', candles:D1 });

  writeJSON(c1, { symbol: base, timeframe:'1H', candles:H1 });
  writeJSON(c4, { symbol: base, timeframe:'4H', candles:H4 });
  writeJSON(cD, { symbol: base, timeframe:'1D', candles:D1 });

  console.log(`[build] done for ${symbol}`);
}

async function main(){
  console.log('[build] symbols =', WANTED.join(', '));
  for(const s of WANTED){
    await buildOne(s);
  }
  console.log('\n[build] all symbols complete ✓');
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
