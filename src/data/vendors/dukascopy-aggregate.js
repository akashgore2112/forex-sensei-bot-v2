// src/data/vendors/dukascopy-aggregate.js
import fs from 'fs';
import path from 'path';

/**
 * Recursively collect all *.csv files under `dir`.
 */
function collectCsvFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.isDirectory()) stack.push(path.join(d, ent.name));
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.csv')) {
        out.push(path.join(d, ent.name));
      }
    }
  }
  return out.sort();
}

/**
 * Very tolerant CSV reader: handles ',' or ';' as separators, with/without header.
 * Expected columns: time, open, high, low, close (Dukascopy m1 csv uses bid series).
 */
function parseCsvLine(line, sep) {
  const parts = line.split(sep);
  // dukascopy-node creates: timestamp, open, high, low, close  (no header)
  // We accept 5 numeric columns; timestamp can be ISO or epoch.
  if (parts.length < 5) return null;
  const [tRaw, o, h, l, c] = parts.slice(0, 5).map((s) => s.trim());
  const t = new Date(tRaw).getTime();
  const open = Number(o);
  const high = Number(h);
  const low = Number(l);
  const close = Number(c);
  if (!Number.isFinite(t) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }
  return { time: t, open, high, low, close };
}

function readCsvFile(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];

  // detect separator
  const firstLine = raw.slice(0, raw.indexOf('\n') + 1);
  const sep = (firstLine.includes(';') && !firstLine.includes(',')) ? ';' : ',';

  const lines = raw.split(/\r?\n/).filter(Boolean);

  // skip header if present
  const startIdx = /^\D/i.test(lines[0][0]) || lines[0].toLowerCase().includes('timestamp') ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const rec = parseCsvLine(lines[i], sep);
    if (rec) rows.push(rec);
  }
  return rows;
}

/**
 * Aggregate minute bars into 1H / 4H / 1D.
 */
function bucketize(rows) {
  const h1 = new Map(); // key: UTC hour start epoch-ms
  const h4 = new Map(); // 0,4,8,12,16,20
  const d1 = new Map(); // 00:00 UTC

  function upd(m, t, price) {
    const ex = m.get(t);
    if (!ex) m.set(t, { time: t, open: price, high: price, low: price, close: price });
    else {
      ex.high = Math.max(ex.high, price);
      ex.low = Math.min(ex.low, price);
      ex.close = price;
    }
  }

  for (const r of rows) {
    const dt = new Date(r.time);
    const H = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), dt.getUTCHours());
    const D = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
    const H4 = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), Math.floor(dt.getUTCHours() / 4) * 4);

    upd(h1, H, r.close);
    upd(h4, H4, r.close);
    upd(d1, D, r.close);
  }

  const toArr = (m) => Array.from(m.values()).sort((a, b) => a.time - b.time);
  return { h1: toArr(h1), h4: toArr(h4), d1: toArr(d1) };
}

/**
 * Main aggregator API.
 * @param {string} rawDir absolute path like …/data/raw/duka/EURUSD
 * @returns {{h1:Array, h4:Array, d1:Array}}
 */
export async function aggregateDukascopy(rawDir) {
  const files = collectCsvFiles(rawDir);
  console.log(`[aggregate] scanning ${files.length} monthly CSV file(s) under ${rawDir}`);

  if (files.length === 0) return { h1: [], h4: [], d1: [] };

  let rows = [];
  for (const f of files) {
    const got = readCsvFile(f);
    rows = rows.concat(got);
  }
  console.log(`[aggregate] parsed ${rows.length.toLocaleString()} minute row(s)`);

  return bucketize(rows);
}
