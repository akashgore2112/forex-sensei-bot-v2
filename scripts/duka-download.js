// scripts/duka-download.js
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import "../src/utils/env.js"; // load .env

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- ENV ----
const RAW_INSTR = process.env.INSTRUMENT || "EURUSD";
// If the instrument has special chars (commodities, indices, metals), DO NOT change case.
// For simple FX (letters only), use lower-case (dukascopy-node convention).
const INSTR = /[./-]/.test(RAW_INSTR) ? RAW_INSTR : RAW_INSTR.toLowerCase();

const FROM_M = process.env.DUKA_FROM_MONTH || "2023-01";
const TO_M   = process.env.DUKA_TO_MONTH   || "2025-10";
const TF     = process.env.DUKA_TIMEFRAME  || "m1";
const RETRIES = Number(process.env.DUKA_RETRIES || 3);

// Where to store raw CSVs. You can force a clean symbol folder name:
const SYMBOL_OUT = process.env.SYMBOL_OUT ||
  // For things like "BRENT.CMD/USD" this becomes "BRENT"
  (/[./]/.test(INSTR) ? INSTR.split(".")[0].toUpperCase() : INSTR.toUpperCase());

// data/raw/duka/<SYMBOL>/YYYY-MM
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", SYMBOL_OUT);

// ensure dir
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

// month range maker: "YYYY-MM" inclusive
function* monthsRange(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const mm = String(m).padStart(2, "0");
    yield `${y}-${mm}`;
    m++; if (m > 12) { m = 1; y++; }
  }
}

// try a runner (dukascopy-node CLI) with retries
function runOne({ instr, tf, month, outDir }) {
  const [y, mm] = month.split("-");
  const from = new Date(Date.UTC(Number(y), Number(mm) - 1, 1, 0, 0, 0));
  const to   = new Date(Date.UTC(Number(y), Number(mm), 0, 23, 59, 59)); // month end 23:59:59

  const args = [
    "--yes",
    "dukascopy-node@latest",
    "--instrument", instr,
    "--timeframe", tf,
    "--date-from", from.toISOString(),
    "--date-to",   to.toISOString(),
    "--format", "csv",
    "--directory", outDir,
  ];

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      console.log(`[runner] dukascopy-node (attempt ${attempt}/${RETRIES})`);
      execFileSync("npx", args, { stdio: "inherit" });
      return true;
    } catch (e) {
      console.log(`[runner] dukascopy-node failed (attempt ${attempt})`);
      if (attempt === RETRIES) return false;
    }
  }
  return false;
}

async function main() {
  console.log(`Downloading ${INSTR} ${FROM_M}..${TO_M} -> ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  let anyOk = false;
  for (const month of monthsRange(FROM_M, TO_M)) {
    const outDir = path.join(OUT_BASE, month);
    ensureDir(outDir);

    // If CSV already there, skip
    const already = fs.readdirSync(outDir).some(f => f.toLowerCase().endsWith(".csv"));
    if (already) {
      console.log(`${month}: already has CSV  -  skip`);
      continue;
    }

    console.log(`\n=> downloading ${INSTR} ${month} -> ${outDir}`);
    const ok = runOne({ instr: INSTR, tf: TF, month, outDir });
    if (!ok) {
      console.error(`\nError: all download attempts failed for ${INSTR} ${month}`);
      process.exitCode = 2;
      // continue loop so you still get other months if possible
    } else {
      anyOk = true;
    }
  }

  if (anyOk) {
    console.log("\n✓ Duka download complete.");
  } else {
    console.error("\n✗ Duka download produced no new files.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
