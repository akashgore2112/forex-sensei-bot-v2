#!/usr/bin/env node
/**
 * Dukascopy downloader (canonicalized for your Termux/CLI)
 * - Uses: dukascopy-node (fallback to dukascopy-cli)
 * - Flags: --date-from / --date-to / --directory (per your help output)
 * - Instrument: always lowercase, slash removed (eurusd, gbpusd, etc.)
 * - Range: by month windows between FROM and TO (env)
 *
 * ENV (read from .env):
 *   INSTRUMENT        = EURUSD   (or GBPUSD, XAUUSD ...)
 *   DUKA_FROM_MONTH   = 2023-01  (inclusive, yyyy-mm)
 *   DUKA_TO_MONTH     = 2025-10  (inclusive, yyyy-mm)
 *   DUKA_TIMEFRAME    = m1       (default m1)
 *   DUKA_CONCURRENCY  = 2        (not used for parallelism; we run sequential for reliability on Termux)
 *
 * Output:
 *   data/raw/duka/<PAIR>/<YYYY-MM>/*.csv
 */

const { spawnSync } = require("node:child_process");
const { mkdirSync, existsSync } = require("node:fs");
const path = require("node:path");

// ---------- helpers ----------
function env(name, def = "") {
  const v = process.env[name];
  return v && String(v).trim() !== "" ? String(v).trim() : def;
}
function normInstr(str) {
  // EUR/USD, eurusd, EURUSD -> eurusd
  return String(str || "EURUSD").toLowerCase().replace("/", "");
}
function parseMonth(str) {
  // "2024-07" -> {y:2024, m:7}
  const m = /^(\d{4})-(\d{2})$/.exec(str);
  if (!m) throw new Error(`Invalid month '${str}', expected YYYY-MM`);
  const y = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new Error(`Invalid month '${str}'`);
  return { y, m: mon };
}
function addMonth({ y, m }, delta) {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}
function fmtMonth({ y, m }) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function firstDay(month) {
  const { y, m } = month;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
function lastDay(month) {
  const { y, m } = month;
  // next month - 1 day
  const d = new Date(Date.UTC(y, m, 1));
  d.setUTCDate(0);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}
function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  return res.status === 0;
}

// ---------- config ----------
const instr = normInstr(env("INSTRUMENT", "EURUSD")); // <- you confirmed: 'eurusd'
const tf = env("DUKA_TIMEFRAME", "m1");

const fromMonthStr = env("DUKA_FROM_MONTH", "2023-01");
const toMonthStr = env("DUKA_TO_MONTH", "2025-10");

const from = parseMonth(fromMonthStr);
const to = parseMonth(toMonthStr);

const outRoot = path.join("data", "raw", "duka", instr.toUpperCase());

console.log("=== Duka download config ===");
console.log({ instr, timeframe: tf, from: fromMonthStr, to: toMonthStr, outRoot });

// ---------- month loop ----------
let cur = { ...from };
while (true) {
  const tag = fmtMonth(cur);
  const fromDate = firstDay(cur);
  const toDate = lastDay(cur);
  const outDir = path.join(outRoot, tag);
  ensureDir(outDir);

  console.log(`\n▶ Download ${instr} ${tf} ${tag} -> ${outDir}`);
  // Primary: dukascopy-node (your working binary)
  const primaryArgs = [
    "--instrument", instr,
    "--timeframe", tf,
    "--date-from", fromDate,
    "--date-to", toDate,
    "--format", "csv",
    "--directory", outDir,
  ];
  const okNode = runCmd("npx", ["--yes", "dukascopy-node@latest", ...primaryArgs]);

  if (!okNode) {
    console.warn("dukascopy-node failed, trying dukascopy-cli fallback…");
    const okCli = runCmd("npx", ["--yes", "dukascopy-cli@latest", ...primaryArgs]);
    if (!okCli) {
      console.error("❌ Both dukascopy-node and dukascopy-cli failed for month:", tag);
      process.exitCode = 1;
      break;
    }
  }

  // next month
  if (cur.y === to.y && cur.m === to.m) break;
  cur = addMonth(cur, 1);
}

console.log("\n✅ Duka download completed (or exited on first failure).");
