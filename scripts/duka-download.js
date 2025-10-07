#!/usr/bin/env node
/**
 * Dukascopy minute downloader (robust CLI multi-strategy).
 * Tries multiple flag styles to survive version differences.
 * Env: DUKA_SYMBOL, DUKA_START, DUKA_END, DUKA_CONCURRENCY
 * Output: data/raw/duka/<SYMBOL>/<YYYY-MM>/*.csv
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const pexec = promisify(execFile);

function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v == null) throw new Error(`Missing env ${name}`);
  return String(v);
}

const SYMBOL = env("DUKA_SYMBOL", "EURUSD").toUpperCase();
const START = new Date(env("DUKA_START", "2023-10-06"));
const END   = new Date(env("DUKA_END", "2025-10-06"));
const CONC  = Math.max(1, Number(env("DUKA_CONCURRENCY", String(Math.min(4, os.cpus().length || 2)))));

if (Number.isNaN(START.getTime()) || Number.isNaN(END.getTime())) throw new Error("DUKA_START/DUKA_END invalid date");
if (END < START) throw new Error("DUKA_END must be >= DUKA_START");

const OUT_ROOT = path.resolve("data/raw/duka", SYMBOL);
fs.mkdirSync(OUT_ROOT, { recursive: true });

function fmtDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

async function runNpx(args) {
  // always latest to avoid old cached versions; --yes to skip prompts
  const full = ["--yes", "dukascopy-node@latest", ...args];
  return await pexec("npx", full, { maxBuffer: 1024 * 1024 * 50 });
}

async function tryAllVariants({ instr, from, to, outDir }) {
  const F = fmtDate;
  const variants = [
    // 1) long flags with equals
    ["--instrument="+instr, "--timeframe=m1", "--from="+F(from), "--to="+F(to), "--format=csv", "--path="+outDir],
    // 2) long flags with space
    ["--instrument", instr, "--timeframe", "m1", "--from", F(from), "--to", F(to), "--format", "csv", "--path", outDir],
    // 3) short flags with equals + uppercase timeframe
    ["-i="+instr, "-timeframe=M1", "-from="+F(from), "-to="+F(to), "-format=csv", "-path="+outDir],
    // 4) short flags with space
    ["-i", instr, "-timeframe", "M1", "-from", F(from), "-to", F(to), "-format", "csv", "-path", outDir],
  ];

  let lastErr;
  for (const args of variants) {
    try {
      const { stdout, stderr } = await runNpx(args);
      if (stdout?.trim()) console.log(stdout.trim());
      if (stderr?.trim()) console.error(stderr.trim());
      return;
    } catch (e) {
      lastErr = e;
      // keep trying next variant
    }
  }
  throw lastErr || new Error("dukascopy-node CLI failed");
}

async function runQueue(items, worker, concurrency) {
  const q = [...items];
  let idx = 0, running = 0, done = 0;
  return await new Promise((resolve, reject) => {
    const pump = () => {
      while (running < concurrency && idx < q.length) {
        const i = idx++;
        running++;
        worker(q[i], i).then(() => {
          running--; done++; pump();
        }).catch(reject);
      }
      if (running === 0 && idx >= q.length) resolve(done);
    };
    pump();
  });
}

async function downloadMonth(chunk) {
  const { y, m, from, to } = chunk;
  const label = `${y}-${String(m).padStart(2, "0")}`;
  const outDir = path.join(OUT_ROOT, label);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`▶ downloading ${SYMBOL} ${label} ${fmtDate(from)} → ${fmtDate(to)}`);

  await tryAllVariants({ instr: SYMBOL, from, to, outDir });
}

async function main() {
  const months = [...monthChunks(START, END)];
  console.log(`Symbol: ${SYMBOL}, months: ${months.length}, out: ${OUT_ROOT}, conc: ${CONC}`);
  const t0 = Date.now();
  await runQueue(months, downloadMonth, CONC);
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Done downloading minute data (${months.length} months) in ${secs}s`);
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
