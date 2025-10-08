// scripts/build-candles.js (ESM)
import "../src/utils/env.js"; // load .env first

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateDukascopy } from "../src/data/vendors/dukascopy-aggregate.js";
import { ema, rsi, atr, adx } from "../src/indicators/ta.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// input + output roots
const RAW_BASE      = path.resolve("data/raw/duka");
const CANDLES_DIR   = path.resolve("data/candles/duka");
const CACHE_DIR     = path.resolve("cache/json");

// internal naming
const SYMBOL_ENV = (process.env.INSTRUMENT || "EURUSD").toUpperCase();
const SYMBOL_OUT = "EUR-USD"; // for cache file names compatibility

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function isFiniteOHLC(c) {
  return (
    c &&
    Number.isFinite(Number(c.time)) &&
    Number.isFinite(Number(c.open)) &&
    Number.isFinite(Number(c.high)) &&
    Number.isFinite(Number(c.low)) &&
    Number.isFinite(Number(c.close))
  );
}

function sanitize(series) {
  // epoch(ms) → ISO, sort by time, de-dup
  const iso = series.map((c) => ({
    ...c,
    time: new Date(Number(c.time)).toISOString(),
  }));
  const clean = iso.filter(isFiniteOHLC).sort((a, b) => new Date(a.time) - new Date(b.time));
  const out = [];
  let lastT = -1;
  for (const c of clean) {
    const t = +new Date(c.time);
    if (t !== lastT) { out.push(c); lastT = t; }
  }
  return out;
}

function addIndicators(candles) {
  const closes = candles.map(c => Number(c.close));
  const highs  = candles.map(c => Number(c.high));
  const lows   = candles.map(c => Number(c.low));

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(highs, lows, closes, 14);
  const adx14 = adx(highs, lows, closes, 14);

  return candles.map((c, i) => ({
    ...c,
    ema20: ema20[i] ?? null,
    ema50: ema50[i] ?? null,
    rsi14: rsi14[i] ?? null,
    atr14: atr14[i] ?? null,
    adx14: adx14[i] ?? null,
  }));
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj));
}

async function main() {
  const rawDir = path.join(RAW_BASE, SYMBOL_ENV);
  ensureDir(CANDLES_DIR);
  ensureDir(CACHE_DIR);

  console.log(`[build] vendor=DUKA symbol=${SYMBOL_ENV} -> aggregate to 1H/4H/1D JSON ...`);
  const agg = await aggregateDukascopy(rawDir);

  const h1 = addIndicators(sanitize(agg.h1));
  const h4 = addIndicators(sanitize(agg.h4));
  const d1 = addIndicators(sanitize(agg.d1));

  const payload = (tf, candles) => ({
    symbol: SYMBOL_OUT,
    timeframe: tf,
    candles,
    meta: { count: candles.length, vendor: "DUKA", tz: "UTC" }
  });

  // Write vendor copies
  writeJson(path.join(CANDLES_DIR, "EUR-USD_1H.json"), payload("1H", h1));
  writeJson(path.join(CANDLES_DIR, "EUR-USD_4H.json"), payload("4H", h4));
  writeJson(path.join(CANDLES_DIR, "EUR-USD_1D.json"), payload("1D", d1));

  // Mirror to cache/json for downstream compatibility
  writeJson(path.join(CACHE_DIR, "EUR-USD_1H.json"), payload("1H", h1));
  writeJson(path.join(CACHE_DIR, "EUR-USD_4H.json"), payload("4H", h4));
  writeJson(path.join(CACHE_DIR, "EUR-USD_1D.json"), payload("1D", d1));

  console.log(`[build] done: wrote to both data/candles/duka and cache/json`);
  console.log(`[build] counts: 1D=${d1.length}, 4H=${h4.length}, 1H=${h1.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
