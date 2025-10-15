// scripts/duka-download.js
// Robust dukascopy downloader (FX + Metals + Commodities)
// - env via src/utils/env.js
// - instruments normalized (eur-usd => eurusd, brent => brent, xauusd ok)
// - runner: dukascopy-node (no legacy cli), with sane env defaults

import "../src/utils/env.js";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --------- ENV ----------
const RAW_INSTR = (process.env.INSTRUMENT || "EURUSD");
const FROM_M    = process.env.DUKA_FROM_MONTH || "2023-01";
const TO_M      = process.env.DUKA_TO_MONTH   || "2025-12";
const TF        = process.env.DUKA_TIMEFRAME  || "m1";
const PRICE_FMT = "csv";

// normalize: lower-case, remove non-alphanum (eur-usd => eurusd, xau/usd => xauusd)
function normalizeInstrument(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
const INSTR = normalizeInstrument(RAW_INSTR);

// out: group by given INSTR label (upper for folder)
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", INSTR.toUpperCase());

// --------- FS helpers ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function hasCsv(dir) {
  try { return fs.readdirSync(dir).some(f => f.toLowerCase().endsWith(".csv")); }
  catch { return false; }
}
function monthSpan(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split("-").map(Number);
  const [ty, tm] = toYYYYMM.split("-").map(Number);
  const out = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// dukascopy-node runner (no legacy cli, no --quiet/--retries here)
function runDukaNode({ fromIso, toIso, outDir }) {
  const args = [
    "dukascopy-node",
    "--instrument", INSTR,           // already normalized
    "--timeframe", TF,
    "--date-from", fromIso,
    "--date-to",   toIso,
    "--format",    PRICE_FMT,
    "--directory", outDir
  ];

  // guard Termux/npm env quirks
  const env = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=512",
    NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org/"
  };

  execFileSync("npx", args, { stdio: "inherit", env });
}

async function main() {
  console.log(`Downloading ${INSTR} ${FROM_M}..${TO_M} -> ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  const months = monthSpan(FROM_M, TO_M);
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    const fromIso = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
    const toIso   = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();
    const outDir  = path.join(OUT_BASE, ym);
    ensureDir(outDir);

    if (hasCsv(outDir)) {
      console.log(`${ym}: already has CSV  -  skip`);
      continue;
    }

    console.log(`\n> downloading ${INSTR} ${ym}`);
    console.log(`Instrument=${INSTR} timeframe=${TF} from=${fromIso} to=${toIso} format=${PRICE_FMT}`);

    let ok = false, lastErr;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        console.log(`[runner] dukascopy-node (attempt ${attempt}/3)`);
        runDukaNode({ fromIso, toIso, outDir });
        ok = true;
      } catch (e) {
        lastErr = e;
        console.warn(`[runner] dukascopy-node failed (attempt ${attempt})`);
        // small backoff
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    if (!ok) {
      console.error(lastErr);
      throw new Error(`All download attempts failed for ${INSTR} ${ym}`);
    }
  }

  console.log("\n✓ Duka download complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
