// src/data/vendors/dukascopy-aggregate.js
import fs from 'fs';
import path from 'path';

/** Safe helpers */
function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
}
function isCsv(name) {
  return typeof name === 'string' && name.toLowerCase().endsWith('.csv');
}

/**
 * Recursively collect *.csv under dir, with debug prints so we can see what’s happening.
 */
function collectCsvFiles(dir) {
  const out = [];
  const stack = [dir];

  const top = safeReaddir(dir);
  console.log(`[aggregate] top-level entries in ${dir}: ${top.length}`);
  if (top.length) {
    const sample = top.slice(0, 10).map((d) => (d.isDirectory() ? `[D] ${d.name}` : `[F] ${d.name}`));
    console.log('[aggregate] sample:', sample.join(', '));
  }

  while (stack.length) {
    const d = stack.pop();
    for (const ent of safeReaddir(d)) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        stack.push(p);
      } else if (ent.isFile() && isCsv(ent.name)) {
        out.push(p);
      }
    }
  }

  out.sort();
  console.log(`[aggregate] collectCsvFiles -> ${out.length} csv file(s)`);
  if (out.length) console.log('[aggregate] first 3:', out.slice(0, 3).map((p) => path.basename(p)).join(' | '));
  return out;
}

/** tolerant CSV parse (comma/semicolon, header/no-header) */
function parseCsvLine(line, sep) {
  const parts = line.split(sep);
  if (parts.length < 5) return null;

  const [tRaw, o, h, l, c] = parts.slice(0, 5).map((s) => s.trim());
  // Dukascopy monthly CSVs from dukascopy-node normally have ISO timestamps (Z) or epoch ms
  const t =
    /^\d+$/.test(tRaw) ? Number(tRaw) : Number.isFinite(Date.parse(tRaw)) ? Date.parse(tRaw) : NaN;

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
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return [];
  }
  raw = raw.trim();
  if (!raw) return [];

  // detect separator using first line
  const nl = raw.indexOf('\n');
  const head = nl === -1 ? raw : raw.slice(0, nl + 1);
  const sep = head.includes(';') && !head.includes(',') ? ';' : ',';

  const lines = raw.split(/\r?\n/).filter(Boolean);

  // header detection: treat a line as header if it has any letters
  const startIdx = /[A-Za-z]/.test(lines[0]) ? 1 : 0;

  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const rec = parseCsvLine(lines[i], sep);
    if (rec) rows.push(rec);
  }
  return rows;
}

/** aggregate minute -> 1H/4H/1D (UTC) */
function bucketize(rows) {
  const h1 = new Map();
  const h4 = new Map();
  const d1 = new Map();

  const upd = (m, t, px) => {
    const ex = m.get(t);
    if (!ex) m.set(t, { time: t, open: px, high: px, low: px, close: px });
    else {
      if (px > ex.high) ex.high = px;
      if (px < ex.low) ex.low = px;
      ex.close = px;
    }
  };

  for (const r of rows) {
    const dt = new Date(r.time);
    const H = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), dt.getUTCHours());
    const H4 = Date.UTC(
      dt.getUTCFullYear(),
      dt.getUTCMonth(),
      dt.getUTCDate(),
      Math.floor(dt.getUTCHours() / 4) * 4
    );
    const D = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());

    upd(h1, H, r.close);
    upd(h4, H4, r.close);
    upd(d1, D, r.close);
  }

  const toArr = (m) => Array.from(m.values()).sort((a, b) => a.time - b.time);
  return { h1: toArr(h1), h4: toArr(h4), d1: toArr(d1) };
}

/**
 * Public API
 * @param {string} rawDir absolute path like …/data/raw/duka/EURUSD
 */
export async function aggregateDukascopy(rawDir) {
  const files = collectCsvFiles(rawDir);

  if (files.length === 0) {
    console.warn('[aggregate] WARNING: no CSV files found. Check download location and symbol casing.');
    return { h1: [], h4: [], d1: [] };
  }

  let rows = [];
  for (const f of files) {
    const got = readCsvFile(f);
    rows = rows.concat(got);
  }
  console.log(`[aggregate] parsed ${rows.length.toLocaleString()} minute row(s)`);

  return bucketize(rows);
}
