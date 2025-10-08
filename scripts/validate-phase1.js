// scripts/validate-phase1.js
// Dynamic Phase-1 validator: checks counts based on actual date span,
// allows slack for weekends/holidays, and scans for NaN OHLC.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..'); // repo root from /scripts

const CACHE_DIR = path.join(root, 'cache', 'json');

const FILES = [
  { name: 'EUR-USD_1D.json', tfMs: 24 * 60 * 60 * 1000 },
  { name: 'EUR-USD_4H.json', tfMs: 4 * 60 * 60 * 1000 },
  { name: 'EUR-USD_1H.json', tfMs: 60 * 60 * 1000 },
];

// How wide can real vs. naive expected be?
// Naive expected assumes EVERY bucket exists. Weekends reduce about ~29% for daily,
// and slightly less for intraday because FX pauses on weekends.
// We set a generous window to avoid false negatives on long spans / holidays.
const LOWER_RATIO = 0.55; // allow down to 55% of naive (covers weekends+holidays)
const UPPER_RATIO = 1.10; // allow up to +10% (buffer for time boundary rounding)

function loadJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing file: ${p}`);
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function checkNaN(file, json) {
  if (!json || !Array.isArray(json.candles)) {
    throw new Error(`Bad JSON shape in ${file}: no candles[]`);
  }
  const badIdx = json.candles.findIndex(
    (c) =>
      c == null ||
      Number.isNaN(+c.open) ||
      Number.isNaN(+c.high) ||
      Number.isNaN(+c.low) ||
      Number.isNaN(+c.close)
  );
  if (badIdx !== -1) {
    throw new Error(`Indicators/values NaN at index=${badIdx} in ${file}`);
  }
}

function checkCount(file, tfMs, json) {
  const n = json.candles.length;
  if (n < 2) {
    throw new Error(`Too few candles in ${file}: ${n}`);
  }
  const firstTs = +json.candles[0].time;
  const lastTs = +json.candles[json.candles.length - 1].time;

  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) {
    throw new Error(`Bad timespan in ${file}: first=${firstTs}, last=${lastTs}`);
  }

  // naive expected (every bucket)
  const naiveExpected = Math.floor((lastTs - firstTs) / tfMs) + 1;
  const minOk = Math.floor(naiveExpected * LOWER_RATIO);
  const maxOk = Math.ceil(naiveExpected * UPPER_RATIO);

  if (n < minOk || n > maxOk) {
    throw new Error(
      `Count out of range: ${file} - ${n} (expected ~${naiveExpected}, allowed ${minOk}..${maxOk})`
    );
  }
  return { n, naiveExpected, minOk, maxOk };
}

function fmtLine(file, meta) {
  return `${path.basename(file)}: ${meta.n} (allowed ${meta.minOk}..${meta.maxOk}, naive ~${meta.naiveExpected})`;
}

async function main() {
  const reports = [];
  for (const f of FILES) {
    const full = path.join(CACHE_DIR, f.name);
    const json = loadJson(full);
    checkNaN(full, json);
    const meta = checkCount(full, f.tfMs, json);
    reports.push(fmtLine(full, meta));
  }

  console.log('Phase 1 validate ✅');
  for (const line of reports) console.log('  -', line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
