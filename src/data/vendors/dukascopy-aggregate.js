// src/data/vendors/dukascopy-aggregate.js
// Robust aggregator for dukascopy-node CSV (m1 bid):
// - supports comma or semicolon delimiters
// - detects timestamp as ISO, epoch-ms, or epoch-sec
// - aggregates to H1 / H4 / D1 UTC OHLC

import fs from 'fs';
import path from 'path';

function listMonthFiles(monthDir) {
  return fs
    .readdirSync(monthDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.csv'))
    .map((d) => path.join(monthDir, d.name))
    .sort();
}

function parseTs(raw) {
  const s = (raw || '').trim();
  if (!s) return NaN;

  // Pure digits? try epoch
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    // Heuristic: seconds (<= 10 digits) vs millis (>= 13 digits)
    if (s.length <= 10) return n * 1000; // epoch seconds
    return n; // epoch millis
  }

  // Fallback: ISO string
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : NaN;
}

function* iterateCsvRows(file) {
  const text = fs.readFileSync(file, 'utf8');

  // Normalize line endings, trim BOM if any
  const src = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
  const lines = src.split('\n');
  if (lines.length <= 1) return;

  // First line is header; we only need column order to confirm delimiter
  const header = lines[0].trim();
  const delim = header.includes(';') ? ';' : ',';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(delim);
    if (parts.length < 5) continue;

    const ts = parseTs(parts[0]);
    const o = Number(parts[1]);
    const h = Number(parts[2]);
    const l = Number(parts[3]);
    const c = Number(parts[4]);

    if (
      Number.isFinite(ts) &&
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(c)
    ) {
      yield { ts, o, h, l, c };
    }
  }
}

function* iterateAllMinutes(rawDir) {
  // rawDir = data/raw/duka/EURUSD
  const months = fs
    .readdirSync(rawDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const m of months) {
    const monthDir = path.join(rawDir, m);
    for (const f of listMonthFiles(monthDir)) {
      yield* iterateCsvRows(f);
    }
  }
}

function bucketKey(ts, sizeMs) {
  return Math.floor(ts / sizeMs) * sizeMs; // UTC floors to bucket start
}

function finalizeBucket(b) {
  if (!b || b.count === 0) return null;
  return {
    time: b.key,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: null,
  };
}

function aggregate(minutes, sizeMs) {
  const out = [];
  let cur = null;

  for (const { ts, o, h, l, c } of minutes) {
    const key = bucketKey(ts, sizeMs);

    if (!cur || key !== cur.key) {
      const fin = finalizeBucket(cur);
      if (fin) out.push(fin);
      cur = { key, open: o, high: h, low: l, close: c, count: 1 };
      continue;
    }
    cur.high = Math.max(cur.high, h);
    cur.low = Math.min(cur.low, l);
    cur.close = c;
    cur.count++;
  }
  const fin = finalizeBucket(cur);
  if (fin) out.push(fin);
  return out;
}

export function aggregateDukascopy(rawDir) {
  // materialize minutes once; reuse for all TFs
  const minutes = [...iterateAllMinutes(rawDir)];
  const MIN = 60 * 1000;
  const H1 = 60 * MIN;
  const H4 = 4 * H1;
  const D1 = 24 * H1;

  return {
    h1: aggregate(minutes, H1),
    h4: aggregate(minutes, H4),
    d1: aggregate(minutes, D1),
  };
}
