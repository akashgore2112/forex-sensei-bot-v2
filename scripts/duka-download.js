// scripts/duka-download.js
// Robust Dukascopy monthly downloader with smart runner + multi-form CLI invocation.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js"; // loads .env (works both .env file & inline env)

const INSTR = process.env.INSTRUMENT?.trim();             // e.g. EURUSD, BRENT.CMD/USD
const SYMBOL = (process.env.SYMBOL_OUT || INSTR || "EURUSD")
  .replaceAll("/", "-")
  .toUpperCase();
const TF     = (process.env.DUKA_TIMEFRAME || "m1").trim();
const FROM_M = (process.env.DUKA_FROM_MONTH || "2023-08").trim();
const TO_M   = (process.env.DUKA_TO_MONTH   || "2025-10").trim();

if (!INSTR) {
  console.error("ERROR: INSTRUMENT env is required (e.g. EURUSD, GBPUSD, BRENT.CMD/USD)");
  process.exit(1);
}

const ROOT = process.cwd();
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", SYMBOL);

function* monthRange(fromYyyyMm, toYyyyMm) {
  const [fy, fm] = fromYyyyMm.split("-").map(Number);
  const [ty, tm] = toYyyyMm.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, "0")}`;
    m++;
    if (m === 13) { m = 1; y++; }
  }
}

function monthStartISO(mStr) { return `${mStr}-01T00:00:00.000Z`; }
function monthEndISO(mStr) {
  const [y, m] = mStr.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00.000Z`;
}

// commodities/indices often rejected by dukascopy-node’s validator enum
const looksLikeCommodity = /\.CMD\//i.test(INSTR) || /\.IDX\//i.test(INSTR);

// ----- runner helpers -----

function runNode({ instrument, timeframe, fromISO, toISO, outDir }) {
  const args = [
    "--yes", "dukascopy-node@latest",
    "--instrument", instrument,
    "--timeframe", timeframe,
    "--date-from", fromISO,
    "--date-to", toISO,
    "--format", "csv",
    "--directory", outDir,
  ];
  return execFileSync("npx", args, { stdio: "pipe", env: process.env }).toString();
}

// Try multiple CLI invocation forms to dodge npx/bin resolution quirks on Termux
function runCli({ instrument, timeframe, fromISO, toISO, outDir }) {
  const baseArgs = [
    "--instrument", instrument,
    "--timeframe", timeframe,
    "--date-from", fromISO,
    "--date-to", toISO,
    "--format", "csv",
    "--directory", outDir,
  ];

  const env = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
  };

  const variants = [
    // 1) direct package@latest
    ["--yes", "dukascopy-cli@latest", ...baseArgs],
    // 2) package mode (-p …) + binary 'dukascopy-cli'
    ["--yes", "-p", "dukascopy-cli@latest", "dukascopy-cli", ...baseArgs],
    // 3) package mode (-p …) + binary 'dukascopy'
    ["--yes", "-p", "dukascopy-cli@latest", "dukascopy", ...baseArgs],
    // 4) older package name on some registries
    ["--yes", "-p", "dukascopy@latest", "dukascopy", ...baseArgs],
  ];

  let lastErr;
  for (const v of variants) {
    try {
      return execFileSync("npx", v, { stdio: "pipe", env }).toString();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.stderr || e?.stdout || e?.message || e);
      console.error("[cli variant failed] tail:\n" + msg.split("\n").slice(-6).join("\n"));
    }
  }
  throw lastErr;
}

function downloadOneMonth(monthStr) {
  const fromISO = monthStartISO(monthStr);
  const toISO   = monthEndISO(monthStr);
  const outDir  = path.join(OUT_BASE, monthStr);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n>> downloading ${SYMBOL.toLowerCase()} ${monthStr} -> ${outDir}`);
  console.log("Instrument=", INSTR, "timeframe", TF, "from", fromISO, "to", toISO, "format=csv");

  const primary = looksLikeCommodity ? "cli" : "node";
  const secondary = looksLikeCommodity ? "node" : "cli";
  const order = [primary, secondary];

  let lastErr = null;

  for (const runner of order) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[runner] ${runner} (attempt ${attempt}/3)`);
        const out = runner === "node"
          ? runNode({ instrument: INSTR, timeframe: TF, fromISO, toISO, outDir })
          : runCli({ instrument: INSTR, timeframe: TF, fromISO, toISO, outDir });
        if (out?.trim()) console.log(out.trim().split("\n").slice(-3).join("\n"));
        return;
      } catch (e) {
        const msg = String(e?.stderr || e?.stdout || e?.message || e);
        console.error(msg.split("\n").slice(-8).join("\n"));
        // If node rejects instrument enum, jump straight to CLI
        if (runner === "node" && /instrument.*does not match any of the allowed values/i.test(msg)) {
          console.warn("node runner rejected instrument; switching to cli for this month.");
          break; // break attempts for node; move to CLI
        }
        lastErr = e;
      }
    }
  }

  throw new Error(`All download attempts failed for ${SYMBOL} ${monthStr}`);
}

// ---- main ----
console.log(`\nDuka download: ${INSTR} (${SYMBOL})  ${FROM_M}..${TO_M}  timeframe=${TF}`);
for (const m of monthRange(FROM_M, TO_M)) {
  downloadOneMonth(m);
}
console.log("\n✓ Duka download complete.");
