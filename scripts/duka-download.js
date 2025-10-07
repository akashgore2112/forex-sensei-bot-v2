#!/usr/bin/env node
/**
 * Dukascopy minute downloader (programmatic API via dukascopy-node)
 * - No CLI flags. Direct JS API => fewer breaking changes.
 * - Env: DUKA_SYMBOL, DUKA_START, DUKA_END, DUKA_CONCURRENCY
 * - Output (per month): data/raw/duka/<SYMBOL>/<YYYY-MM>/*.csv
 *
 * Run: npm run data:duka:download
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---- safe dynamic import (handles CJS/ESM shapes) ----
async function loadDuka() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = await import("dukascopy-node");
  // library exports vary by version; normalize
  const api =
    mod.download ||
    mod.default?.download ||
    mod.default ||
    mod; // some builds export the function itself
  const Timeframe =
    mod.Timeframe || mod.default?.Timeframe || { m1: "m1" };
  if (typeof api !== "function") {
    throw new Error("dukascopy-node: download() API not found");
  }
  return { download: api, Timeframe };
}

function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v == null) throw new Error(`Missing env ${name}`);
  return String(v);
}

// ---- env & paths ----
const SYMBOL = env("DUKA_SYMBOL", "EURUSD").toUpperCase(); // e.g. EURUSD
const START = new Date(env("DUKA_START", "2023-10-06"));   // inclusive UTC
const END   = new Date(env("DUKA_END", "2025-10-06"));     // inclusive UTC
const CONC  = Math.max(1, Number(env("DUKA_CONCURRENCY", String(Math.min(4, os.cpus().length || 2)))));

if (Number.isNaN(START.getTime()) || Number.isNaN(END.getTime())) {
  throw new Error("DUKA_START/DUKA_END invalid date (YYYY-MM-DD expected)");
}
if (END < START) throw new Error("DUKA_END must be >= DUKA_START");

const OUT_ROOT = path.resolve("data/raw/duka", SYMBOL);
fs.mkdirSync(OUT_ROOT, { recursive: true });

function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// calendar-month chunks covering [START, END]
function* monthChunks(start, end) {
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const lastM = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  for (
    let y = first.getUTCFullYear(), m = first.getUTCMonth();
    y < lastM.getUTCFullYear() || (y === lastM.getUTCFullYear() && m <= lastM.getUTCMonth());
    m = (m + 1) % 12, y += m === 0 ? 1 : 0
  ) {
    const startOfMonth = new Date(Date.UTC(y, m, 1));
    const endOfMonth   = new Date(Date.UTC(y, m + 1, 0));
    const from = startOfMonth < start ? start : startOfMonth;
    const to   = endOfMonth   > end   ? end   : endOfMonth;
    yield { y, m: m + 1, from, to };
  }
}

async function runQueue(items, worker, concurrency) {
  const q = [...items];
  const results = [];
  let active = 0, idx = 0;
  return await new Promise((resolve, reject) => {
    const pump = () => {
      while (active < concurrency && idx < q.length) {
        const i = idx++, item = q[i];
        active++;
        worker(item, i)
          .then((r) => results[i] = r)
          .catch(reject)
          .finally(() => { active--; pump(); });
      }
      if (active === 0 && idx >= q.length) resolve(results);
    };
    pump();
  });
}

async function downloadMonth(download, Timeframe, chunk) {
  const { y, m, from, to } = chunk;
  const label = `${y}-${String(m).padStart(2, "0")}`;
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`▶ ${SYMBOL} ${label} ${fmtDate(from)} → ${fmtDate(to)} (m1)`);

  // Many versions accept this shape:
  // download({ instrument, dates: { from, to }, timeframe, format, folder })
  // Some expect `dateFrom/dateTo` or `fromDate/toDate` — provide all aliases.
  const opts = {
    instrument: SYMBOL,
    dates: { from, to },
    dateFrom: from,  // aliases for older versions
    dateTo: to,
    fromDate: from,
    toDate: to,
    timeframe: Timeframe.m1 || "m1",
    format: "csv",
    folder: outDir,
    // priceType may be required on some builds; default to BID
    priceType: "bid"
  };

  // Try normal call
  try {
    await download(opts);
    return { label, outDir };
  } catch (e1) {
    // Fallback: some builds expect `format: 'csv'` under `file` or `options`
    try {
      await download({
        instrument: SYMBOL,
        from, to,
        timeframe: Timeframe.m1 || "m1",
        format: "csv",
        folder: outDir,
        priceType: "bid"
      });
      return { label, outDir };
    } catch (e2) {
      throw new Error(
        `dukascopy-node download failed for ${label}\n1) ${e1?.message}\n2) ${e2?.message}`
      );
    }
  }
}

async function main() {
  const { download, Timeframe } = await loadDuka();
  const chunks = [...monthChunks(START, END)];
  console.log(`Symbol: ${SYMBOL}, months: ${chunks.length}, out: ${OUT_ROOT}, conc: ${CONC}`);

  const t0 = Date.now();
  await runQueue(chunks, (c) => downloadMonth(download, Timeframe, c), CONC);
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Done downloading minute data (${chunks.length} months) in ${secs}s`);
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
