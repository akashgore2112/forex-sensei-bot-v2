// src/data/vendors/dukascopy-aggregate.js
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const ensureDir = async (p) => fsp.mkdir(p, { recursive: true });

/** parse a CSV line -> { ts, o, h, l, c } (tolerates either header names or raw values) */
const parseCsvLine = (line, idxMap) => {
  const parts = line.split(",");
  const tRaw = parts[idxMap.time]?.trim();
  const o = Number(parts[idxMap.open]);
  const h = Number(parts[idxMap.high]);
  const l = Number(parts[idxMap.low]);
  const c = Number(parts[idxMap.close]);
  if (!tRaw || Number.isNaN(o) || Number.isNaN(h) || Number.isNaN(l) || Number.isNaN(c)) return null;

  let ts;
  if (/^\d+$/.test(tRaw)) ts = new Date(Number(tRaw)); // epoch ms
  else ts = new Date(tRaw);                             // ISO-like string
  if (Number.isNaN(ts.getTime())) return null;

  return { ts, o, h, l, c };
};

const detectHeaderIndexes = (headerLine) => {
  const cols = headerLine.split(",").map((s) => s.trim().toLowerCase());
  const find = (names) => {
    for (const nm of names) {
      const i = cols.indexOf(nm);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    time:  find(["time", "timestamp", "date"]),
    open:  find(["open", "bid_open", "bidopen"]),
    high:  find(["high", "bid_high", "bidhigh"]),
    low:   find(["low", "bid_low", "bidlow"]),
    close: find(["close", "bid_close", "bidclose"]),
  };
};

const floorToHourUTC = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0);
const floorTo4HUTC   = (d) => {
  const h = d.getUTCHours();
  const base = h - (h % 4);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), base, 0, 0, 0);
};
const floorToDayUTC  = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);

const upsertBar = (map, key, px) => {
  let bar = map.get(key);
  if (!bar) {
    bar = { t: key, open: px.o, high: px.h, low: px.l, close: px.c, volume: null };
    map.set(key, bar);
    return;
  }
  if (px.h > bar.high) bar.high = px.h;
  if (px.l < bar.low)  bar.low  = px.l;
  bar.close = px.c;
};

const readAllCsv = async (rootDir) => {
  const months = (await fsp.readdir(rootDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  const files = [];
  for (const m of months) {
    const monthDir = path.join(rootDir, m);
    const fList = await fsp.readdir(monthDir);
    for (const f of fList) if (f.endsWith(".csv")) files.push(path.join(monthDir, f));
  }
  files.sort();
  return files;
};

export async function aggregateDukascopy({
  symbol = "EURUSD",
  rawRoot = "data/raw/duka",
  outRoot = "data/candles/duka",
  cacheRoot = "cache/json",
} = {}) {
  const instDir = path.join(rawRoot, symbol);
  const allCsv = await readAllCsv(instDir);
  if (allCsv.length === 0) {
    console.log(`[aggregate] No CSV files found at ${instDir}`);
    return null;
  }

  const h1 = new Map();
  const h4 = new Map();
  const d1 = new Map();

  for (const file of allCsv) {
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    let headerParsed = false;
    let idxMap = null;

    for await (const line of rl) {
      if (!line) continue;

      if (!headerParsed) {
        idxMap = detectHeaderIndexes(line);

        // If header wasn't recognized, treat first line as data (fallback index map),
        // then keep reading the rest as pure data lines.
        if (Object.values(idxMap).some((i) => i === -1)) {
          idxMap = { time: 0, open: 1, high: 2, low: 3, close: 4 };
          const px0 = parseCsvLine(line, idxMap);
          if (px0) {
            upsertBar(h1, floorToHourUTC(px0.ts), px0);
            upsertBar(h4, floorTo4HUTC(px0.ts), px0);
            // 1D bars: Mon–Fri only (skip weekends)
            const wd0 = px0.ts.getUTCDay();
            if (wd0 >= 1 && wd0 <= 5) upsertBar(d1, floorToDayUTC(px0.ts), px0);
          }
        }
        headerParsed = true;
        continue;
      }

      const px = parseCsvLine(line, idxMap);
      if (!px) continue;

      upsertBar(h1, floorToHourUTC(px.ts), px);
      upsertBar(h4, floorTo4HUTC(px.ts), px);

      // 1D bars: Mon–Fri only (skip weekends)
      const wd = px.ts.getUTCDay();
      if (wd >= 1 && wd <= 5) upsertBar(d1, floorToDayUTC(px.ts), px);
    }
  }

  // finalize → sorted arrays
  const toCandles = (m) =>
    Array.from(m.keys())
      .sort((a, b) => a - b)
      .map((t) => ({
        time: new Date(t).toISOString(),
        open: m.get(t).open,
        high: m.get(t).high,
        low:  m.get(t).low,
        close:m.get(t).close,
        volume: null,
      }));

  const symOut = "EUR-USD"; // keep file naming compatible with existing pipeline
  const out = {
    "1H": { symbol: symOut, timeframe: "1H", candles: toCandles(h1), meta: { gaps: 0 } },
    "4H": { symbol: symOut, timeframe: "4H", candles: toCandles(h4), meta: { gaps: 0 } },
    "1D": { symbol: symOut, timeframe: "1D", candles: toCandles(d1), meta: { gaps: 0 } },
  };

  await ensureDir(outRoot);
  await ensureDir(cacheRoot);

  // persist both to data/candles (for inspection) and cache/json (for the rest of the app)
  await fsp.writeFile(path.join(outRoot,  `EUR-USD_1H.json`), JSON.stringify(out["1H"]));
  await fsp.writeFile(path.join(outRoot,  `EUR-USD_4H.json`), JSON.stringify(out["4H"]));
  await fsp.writeFile(path.join(outRoot,  `EUR-USD_1D.json`), JSON.stringify(out["1D"]));
  await fsp.writeFile(path.join(cacheRoot, `EUR-USD_1H.json`), JSON.stringify(out["1H"]));
  await fsp.writeFile(path.join(cacheRoot, `EUR-USD_4H.json`), JSON.stringify(out["4H"]));
  await fsp.writeFile(path.join(cacheRoot, `EUR-USD_1D.json`), JSON.stringify(out["1D"]));

  console.log(
    `[aggregate] done: 1H=${out["1H"].candles.length}, 4H=${out["4H"].candles.length}, 1D=${out["1D"].candles.length}`
  );
  return out;
}
