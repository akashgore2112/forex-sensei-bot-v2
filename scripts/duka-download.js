// scripts/duka-download.js
// Single-symbol, month-by-month Dukascopy downloader with robust fallbacks.
//
// Usage (env driven):
//   INSTRUMENT=EURUSD DUKA_FROM_MONTH=2023-01 DUKA_TO_MONTH=2025-10 DUKA_TIMEFRAME=m1 node scripts/duka-download.js

import "../src/utils/env.js";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INSTR = (process.env.INSTRUMENT || "EURUSD").toLowerCase();   // e.g. eurusd
const FROM_M = process.env.DUKA_FROM_MONTH || "2023-01";            // YYYY-MM
const TO_M   = process.env.DUKA_TO_MONTH   || "2025-10";            // YYYY-MM
const TF     = process.env.DUKA_TIMEFRAME  || "m1";                 // m1, m5, m15, m30, h1...
const PRICE_FMT = "csv";

// Where to save: data/raw/duka/<SYMBOL>/YYYY-MM
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

// Run an npx command with a tiny heap (mobile friendly)
function runNPX(pkg, args) {
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" };
  execFileSync("npx", ["--yes", pkg, ...args], { stdio: "inherit", env });
}

function csvExists(dir) {
  try { return fs.readdirSync(dir).some(f => f.endsWith(".csv")); }
  catch { return false; }
}

async function main() {
  const months = monthList(FROM_M, TO_M);
  console.log(`Downloading ${INSTR.toUpperCase()} ${months[0]}..${months.at(-1)} → ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
    const to   = new Date(Date.UTC(y, m    , 0, 23, 59, 59)).toISOString();
    const outDir = path.join(OUT_BASE, ym);
    ensureDir(outDir);

    if (csvExists(outDir)) {
      console.log(`${ym}: already has CSV — skip`);
      continue;
    }

    console.log(`\n> downloading ${INSTR.toUpperCase()} ${ym} → ${outDir}`);
    console.log(`  timeframe=${TF}  from=${from}  to=${to}  format=${PRICE_FMT}`);

    // Common CLI args across dukascopy-* tools
    const cliArgs = [
      "--instrument", INSTR,
      "--timeframe", TF,
      "--date-from", from,
      "--date-to", to,
      "--format", PRICE_FMT,
      "--directory", outDir,
      "--quiet",
      "--retries", "2",
    ];

    // Try a couple of well-known CLIs
    const candidates = [
      ["dukascopy-cli@latest", cliArgs], // preferred
      ["dukascopy@latest",     cliArgs], // fallback package name
    ];

    let ok = false;
    for (let i = 0; i < candidates.length && !ok; i++) {
      const [pkg, args] = candidates[i];
      try {
        runNPX(pkg, args);
        ok = true;
      } catch (e) {
        console.warn(`[warn] ${pkg} failed (${e?.message || e}); trying next…`);
        // one warm-cache retry for the same pkg:
        try { runNPX(pkg, args); ok = true; }
        catch { /* fall through to next candidate */ }
      }
    }
    if (!ok) {
      throw new Error(`All download methods failed for ${INSTR.toUpperCase()} ${ym}`);
    }
  }

  console.log("\n✓ Duka download complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
