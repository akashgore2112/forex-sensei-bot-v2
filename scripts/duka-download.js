// scripts/duka-download.js
// Single-symbol, month-by-month downloader with low-memory child process.
// Usage (env):
//   INSTRUMENT=EURUSD DUKA_FROM_MONTH=2023-01 DUKA_TO_MONTH=2025-12 node scripts/duka-download.js

import "../src/utils/env.js";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INSTR = (process.env.INSTRUMENT || "EURUSD").toLowerCase();
const FROM_M = process.env.DUKA_FROM_MONTH || "2023-01";
const TO_M   = process.env.DUKA_TO_MONTH   || "2025-12";
const TF     = process.env.DUKA_TIMEFRAME  || "m1";
const PRICE_FMT = "csv";

// where to save: data/raw/duka/<SYMBOL>/YYYY-MM
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", INSTR.toUpperCase());

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function monthList(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split("-").map(Number);
  const [ty, tm] = toYYYYMM.split("-").map(Number);
  const out = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function runNPX(args) {
  // low memory to avoid OOM on phones
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" };
  return execFileSync("npx", args, { stdio: "inherit", env });
}

function csvExists(dir) {
  try { return fs.readdirSync(dir).some((f) => f.endsWith(".csv")); }
  catch { return false; }
}

(async function main() {
  const months = monthList(FROM_M, TO_M);
  console.log(`Downloading ${INSTR} ${months[0]}..${months.at(-1)}  ->  ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
    const to   = new Date(Date.UTC(y, m    , 0, 23, 59, 59)).toISOString();
    const outDir = path.join(OUT_BASE, ym);
    ensureDir(outDir);

    if (csvExists(outDir)) {
      console.log(`${ym}: already has CSV  -  skip`);
      continue;
    }

    console.log(`\n> downloading ${INSTR} ${ym}  ->  ${outDir}`);
    console.log("Downloading historical price data for:");
    console.log(`Instrument:  ${INSTR}`);
    console.log(`Timeframe:   ${TF}`);
    console.log(`From date:   ${from}`);
    console.log(`To date:     ${to}`);
    console.log(`Price type:  bid`);
    console.log(`Format:      ${PRICE_FMT}`);

    // ✅ Hard-lock package resolution so npx never guesses wrong.
    const baseArgs = [
      "--yes",
      "--package", "dukascopy-cli@1.6.3",
      "dukascopy-cli",
      "--instrument", INSTR,
      "--timeframe", TF,
      "--date-from", from,
      "--date-to", to,
      "--format", PRICE_FMT,
      "--directory", outDir,
      "--quiet",
      "--retries", "2"
    ];

    try {
      runNPX(baseArgs);
    } catch {
      console.warn("dukascopy-cli failed, retrying once...");
      runNPX(baseArgs);
    }
  }

  console.log("\n✓ Duka download complete.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
