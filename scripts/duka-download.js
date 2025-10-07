#!/usr/bin/env node
/**
 * Dukascopy minute downloader (per-month chunks, robust flags).
 * - Uses: `npx --yes dukascopy-node@latest` CLI (no interactive prompts)
 * - Env: DUKA_SYMBOL, DUKA_START, DUKA_END, DUKA_CONCURRENCY
 * - Output: data/raw/duka/<SYMBOL>/<YYYY-MM>/*.csv
 *
 * Run: npm run data:duka:download
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const pexec = promisify(execFile);

// ---------- env helpers ----------
function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v == null) throw new Error(`Missing env ${name}`);
  return String(v);
}

const SYMBOL = env("DUKA_SYMBOL", "EURUSD").toUpperCase(); // no slash
const START = new Date(env("DUKA_START", "2023-10-06"));   // inclusive
const END   = new Date(env("DUKA_END", "2025-10-06"));     // inclusive
const CONC  = Number(env("DUKA_CONCURRENCY", "4"));
const OUT_ROOT = path.resolve("data/raw/duka", SYMBOL);

if (Number.isNaN(START.getTime()) || Number.isNaN(END.getTime())) {
  throw new Error("DUKA_START/DUKA_END invalid date (YYYY-MM-DD expected)");
}
if (END < START) throw new Error("DUKA_END must be >= DUKA_START");

fs.mkdirSync(OUT_ROOT, { recursive: true });

// ---------- date utils ----------
function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function* monthChunks(start, end) {
  // iterate calendar months covering [start, end]
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

// ---------- concurrency queue ----------
async function runQueue(items, worker, concurrency) {
  const tasks = [...items];
  const results = [];
  let running = 0, i = 0;

  return await new Promise((resolve, reject) => {
    const pump = () => {
      while (running < concurrency && i < tasks.length) {
        const idx = i++, item = tasks[idx];
        running++;
        worker(item, idx).then(r => results[idx] = r)
          .catch(reject)
          .finally(() => { running--; pump(); });
      }
      if (running === 0 && i >= tasks.length) resolve(results);
    };
    pump();
  });
}

// ---------- main worker (with robust CLI flags) ----------
async function downloadMonth(chunk) {
  const { y, m, from, to } = chunk;
  const label = `${y}-${String(m).padStart(2, "0")}`;
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });

  console.log("▶ downloading", SYMBOL, label, fmtDate(from), "→", fmtDate(to));

  // helper to run npx with given args; --yes avoids prompts
  async function runNpx(args) {
    const full = ["--yes", "dukascopy-node@latest", ...args];
    return await pexec("npx", full, { maxBuffer: 1024 * 1024 * 50 });
  }

  // Try 1: long flags (common on latest)
  const args1 = [
    "--instrument", SYMBOL,
    "--timeframe", "m1",
    "--from", fmtDate(from),
    "--to", fmtDate(to),
    "--format", "csv",
    "--path", outDir
  ];

  try {
    const { stdout, stderr } = await runNpx(args1);
    if (stdout?.trim()) console.log(stdout.trim());
    if (stderr?.trim()) console.error(stderr.trim());
    return { label, outDir };
  } catch (e1) {
    console.warn("long-flag attempt failed, retrying with short flags/uppercase…");

    // Try 2: short flags + uppercase timeframe (compat on some builds)
    const args2 = [
      "-i", SYMBOL,
      "-timeframe", "M1",
      "-from", fmtDate(from),
      "-to", fmtDate(to),
      "-format", "csv",
      "-path", outDir
    ];
    try {
      const { stdout, stderr } = await runNpx(args2);
      if (stdout?.trim()) console.log(stdout.trim());
      if (stderr?.trim()) console.error(stderr.trim());
      return { label, outDir };
    } catch (e2) {
      throw new Error(
        `dukascopy-node failed for ${label}\nFirst: ${e1.message}\nSecond: ${e2.message}`
      );
    }
  }
}

// ---------- entry ----------
async function main() {
  const months = [...monthChunks(START, END)];
  console.log(`Symbol: ${SYMBOL}, months: ${months.length}, out: ${OUT_ROOT}, conc: ${Math.max(1, CONC)}`);

  const t0 = Date.now();
  await runQueue(months, downloadMonth, Math.max(1, CONC));
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Done downloading minute data (${months.length} months) in ${secs}s`);
}

main().catch(e => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
