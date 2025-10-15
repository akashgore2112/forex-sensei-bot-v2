import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js";
import { aggregateDukascopy } from "../src/data/vendors/dukascopy-aggregate.js";
import { ema, rsi, atr, adx } from "../src/indicators/ta.js";

const ROOT = process.cwd();
const RAW_ROOT   = path.join(ROOT, "data", "raw", "duka-commod");
const CANDLES_OUT = path.join(ROOT, "data", "candles", "commod");
const CACHE_OUT   = path.join(ROOT, "cache", "json-commod");

const SYMS = (process.env.INSTRUMENTS_COMMOD || "").split(",").map(s => s.trim()).filter(Boolean);

for (const p of [CANDLES_OUT, CACHE_OUT]) fs.mkdirSync(p, { recursive: true });

function sanitizeISO(series) {
  const iso = series.map(c => ({ ...c, time: new Date(Number(c.time)).toISOString() }));
  const clean = iso.filter(c =>
    c && Number.isFinite(+new Date(c.time)) &&
    Number.isFinite(+c.open) && Number.isFinite(+c.high) &&
    Number.isFinite(+c.low) && Number.isFinite(+c.close)
  ).sort((a,b)=> new Date(a.time) - new Date(b.time));
  const out=[]; let last=null;
  for (const c of clean) {
    const t=+new Date(c.time);
    if (t!==last){ out.push(c); last=t; }
  }
  return out;
}
function addIndicators(cs) {
  const closes = cs.map(c=>c.close);
  const highs  = cs.map(c=>c.high);
  const lows   = cs.map(c=>c.low);
  const ema20 = ema(closes,20), ema50=ema(closes,50);
  const rsi14 = rsi(closes,14);
  const atr14 = atr(highs,lows,closes,14);
  const adx14 = adx(highs,lows,closes,14);
  return cs.map((c,i)=>({...c,
    ema20: ema20[i] ?? null,
    ema50: ema50[i] ?? null,
    rsi14: rsi14[i] ?? null,
    atr14: atr14[i] ?? null,
    adx14: adx14[i] ?? null
  }));
}
function writeJSON(p, data){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data), "utf8");
}

for (const sym of SYMS) {
  const rawDir = path.join(RAW_ROOT, sym.toUpperCase());
  console.log(`\n[build-commod] ${sym.toUpperCase()}  raw → ${rawDir}`);
  const agg = await aggregateDukascopy(rawDir);   // {h1,h4,d1} in epoch-ms
  const H1 = addIndicators(sanitizeISO(agg.h1));
  const H4 = addIndicators(sanitizeISO(agg.h4));
  const D1 = addIndicators(sanitizeISO(agg.d1));

  const files = {
    h1: `${sym.toUpperCase()}_1H.json`,
    h4: `${sym.toUpperCase()}_4H.json`,
    d1: `${sym.toUpperCase()}_1D.json`,
  };
  writeJSON(path.join(CACHE_OUT,  files.h1), { symbol:sym.toUpperCase(), timeframe:"1H", candles:H1 });
  writeJSON(path.join(CACHE_OUT,  files.h4), { symbol:sym.toUpperCase(), timeframe:"4H", candles:H4 });
  writeJSON(path.join(CACHE_OUT,  files.d1), { symbol:sym.toUpperCase(), timeframe:"1D", candles:D1 });
  writeJSON(path.join(CANDLES_OUT,files.h1), { symbol:sym.toUpperCase(), timeframe:"1H", candles:H1 });
  writeJSON(path.join(CANDLES_OUT,files.h4), { symbol:sym.toUpperCase(), timeframe:"4H", candles:H4 });
  writeJSON(path.join(CANDLES_OUT,files.d1), { symbol:sym.toUpperCase(), timeframe:"1D", candles:D1 });

  console.log(`[build-commod] wrote ${files.d1}, ${files.h4}, ${files.h1}`);
}
console.log("\n✓ build-commod done (candles + cache).");
