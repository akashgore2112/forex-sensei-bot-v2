// src/data/vendors/dukascopy-aggregate.js
// Reads monthly CSVs produced by dukascopy-node (m1 bid CSV),
// aggregates to H1/H4/D1 OHLC. It is defensive against empty buckets.

import fs from 'fs';
import path from 'path';

function listMonthFiles(monthDir) {
  // expect files like: eurusd-m1-bid-YYYY-MM-01_to_YYYY-MM-31.csv (your naming)
  // we simply read all .csv in the directory.
  return fs
    .readdirSync(monthDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.csv'))
    .map((d) => path.join(monthDir, d.name))
    .sort();
}

function* iterateCsvRows(file) {
  // dukascopy-node CSV header typically:
  // "timestamp,open,high,low,close" (no volume when bid-only)
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines.length <= 1) return;
  // skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(','); // dukascopy-node uses commas
    if (parts.length < 5) continue;
    const ts = +new Date(parts[0]); // ISO timestamp
    const o = +parts[1];
    const h = +parts[2];
    const l = +parts[3];
    const c = +parts[4];
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

function bucketKey(ts, sizeMs, tzOffset = 0) {
  // All UTC; ensure bucket aligns on sizeMs
  const t = ts + tzOffset;
  return Math.floor(t / sizeMs) * sizeMs - tzOffset;
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

function aggregate(stream, sizeMs) {
  const out = [];
  let cur = null;

  for (const { ts, o, h, l, c } of stream) {
    const key = bucketKey(ts, sizeMs, 0); // UTC
    if (!cur || key !== cur.key) {
      // flush previous
      const fin = finalizeBucket(cur);
      if (fin) out.push(fin);
      // start new
      cur = { key, open: o, high: h, low: l, close: c, count: 1 };
      continue;
    }
    // same bucket
    if (o < cur.openTimeTs) {
      // never happens with minute order, but keep it safe
      cur.open = o;
    }
    cur.high = Math.max(cur.high, h);
    cur.low = Math.min(cur.low, l);
    cur.close = c;
    cur.count++;
  }

  // flush tail
  const fin = finalizeBucket(cur);
  if (fin) out.push(fin);

  return out;
}

export function aggregateDukascopy(rawDir) {
  // Build a fresh minute iterator every call (so we can reuse for each TF)
  const minutes = [...iterateAllMinutes(rawDir)]; // materialize once
  const MINUTE = 60 * 1000;
  const H1 = 60 * MINUTE;
  const H4 = 4 * H1;
  const D1 = 24 * H1;

  return {
    h1: aggregate(minutes, H1),
    h4: aggregate(minutes, H4),
    d1: aggregate(minutes, D1),
  };
}
