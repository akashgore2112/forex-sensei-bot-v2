#!/usr/bin/env node
/**
 * Dukascopy minute downloader (per-month chunks)
 * - Uses: `npx dukascopy-node` CLI (so we don't depend on internal JS API)
 * - Env: DUKA_SYMBOL, DUKA_START, DUKA_END, DUKA_CONCURRENCY
 * - Output: data/raw/duka/<SYMBOL>/<YYYY-MM>/ ... (files created by CLI)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const pexec = promisify(execFile);

function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v == null) throw new Error(`Missing env ${name}`);
  return String(v);
}

// ---- env & paths ----
const SYMBOL = env("DUKA_SYMBOL", "EURUSD").toUpperCase(); // no slash
const START = new Date(env("DUKA_START", "2023-10-06"));
const END = new Date(env("DUKA_END", "2025-10-06"));
const CONC = Number(env("DUKA_CONCURRENCY", "4"));
const OUT_ROOT = path.resolve("data/raw/duka", SYMBOL);

if (Number.isNaN(START.getTime()) || Number.isNaN(END.getTime()))
  throw new Error("DUKA_START/DUKA_END invalid date");
if (END < START) throw new Error("DUKA_END must be >= DUKA_START");

fs.mkdirSync(OUT_ROOT, { recursive: true });

// ---- month chunk generator (inclusive windows per calendar month) ----
function* monthChunks(start, end) {
  const s = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  for (
    let y = s.getUTCFullYear(), m = s.getUTCMonth();
    y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth());
    m = (m + 1) % 12, y += m === 0 ? 1 : 0
  ) {
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 0)); // month end
    // clamp to requested start/end
    const fromClamped = from < start ? start : from;
    const toClamped = to > end ? end : to;
    yield { y, m: m + 1, from: fromClamped, to: toClamped };
  }
}

function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- queue runner for limited concurrency ----
async function runQueue(items, worker, concurrency) {
  const q = [...items];
  const results = [];
  let active = 0;
  let idx = 0;

  return await new Promise((resolve, reject) => {
    const next = () => {
      while (active < concurrency && idx < q.length) {
        const i = idx++;
        active++;
        worker(q[i], i)
          .then((r) => results[i] = r)
          .catch(reject)
          .finally(() => { active--; next(); });
      }
      if (active === 0 && idx >= q.length) resolve(results);
    };
    next();
  });
}

async function downloadMonth(chunk) {
  const { y, m, from, to } = chunk;
  const label = `${y}-${String(m).padStart(2, "0")}`;
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });

  // CLI args: timeframe m1, format csv (fast), instrument e.g. EURUSD
  const args = [
    "dukascopy-node",
    "--instrument", SYMBOL,
    "--timeframe", "m1",
    "--from", fmtDate(from),
    "--to", fmtDate(to),
    "--format", "csv",
    "--path", outDir
  ];

  console.log("▶ downloading", SYMBOL, label, fmtDate(from), "→", fmtDate(to));
  const { stdout, stderr } = await pexec("npx", args, { maxBuffer: 1024 * 1024 * 50 });
  if (stdout?.trim()) console.log(stdout.trim());
  if (stderr?.trim()) console.error(stderr.trim());
  return { label, outDir };
}

async function main() {
  const chunks = [...monthChunks(START, END)];
  console.log(`Symbol: ${SYMBOL}, months: ${chunks.length}, out: ${OUT_ROOT}, conc: ${CONC}`);

  const t0 = Date.now();
  await runQueue(chunks, downloadMonth, Math.max(1, CONC));
  const ms = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Done downloading minute data (${chunks.length} months) in ${ms}s`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
