// scripts/validate-phase1.js
// Accepts time as epoch-ms (number) OR ISO string.
// Checks monotonic time and rough count ranges for D1/H4/H1.

import fs from 'fs';
import path from 'path';

const FILES = [
  { tf: 'D1', file: 'cache/json/EUR-USD_1D.json',  min: 520,  max: 1100 },
  { tf: 'H4', file: 'cache/json/EUR-USD_4H.json',  min: 3000, max: 9000 },
  { tf: 'H1', file: 'cache/json/EUR-USD_1H.json',  min: 15000, max: 40000 },
];

function toEpochMs(t) {
  // number → epoch ms, string(ISO) → Date.parse, else NaN
  if (t == null) return NaN;
  if (typeof t === 'number') return Number.isFinite(t) ? t : NaN;
  if (typeof t === 'string') {
    const v = Date.parse(t);
    return Number.isFinite(v) ? v : NaN;
  }
  return NaN;
}

function readJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function checkCount(tf, file, count, min, max) {
  if (count < min || count > max) {
    throw new Error(`Count out of range: ${path.basename(file)} → ${count} (need ${min}..${max})`);
  }
}

function checkTimes(tf, file, candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error(`No candles in ${file}`);
  }
  const firstT = toEpochMs(candles[0].time);
  const lastT  = toEpochMs(candles.at(-1).time);
  if (!Number.isFinite(firstT) || !Number.isFinite(lastT)) {
    throw new Error(`Bad timestamp in ${file}: first=${candles[0]?.time}, last=${candles.at(-1)?.time}`);
  }
  // monotonic non-decreasing
  let prev = firstT;
  for (let i = 1; i < candles.length; i++) {
    const t = toEpochMs(candles[i].time);
    if (!Number.isFinite(t) || t < prev) {
      throw new Error(`Non-monotonic time at index ${i} in ${file}: ${candles[i].time}`);
    }
    prev = t;
  }
  return { firstT, lastT };
}

function fmt(ts) {
  return new Date(ts).toISOString();
}

async function main() {
  const report = [];
  for (const { tf, file, min, max } of FILES) {
    const j = readJson(file);
    const candles = j.candles || [];
    checkCount(tf, file, candles.length, min, max);
    const { firstT, lastT } = checkTimes(tf, file, candles);
    report.push({ tf, file, count: candles.length, first: fmt(firstT), last: fmt(lastT) });
  }

  // Pretty summary
  console.log('Phase-1 validate ✅');
  for (const r of report) {
    console.log(
      `${r.tf.padEnd(2)}  count=${String(r.count).padStart(6)}  first=${r.first}  last=${r.last}  ← ${r.file}`
    );
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
