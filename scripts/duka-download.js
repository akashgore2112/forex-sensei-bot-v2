// scripts/duka-download.js
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

const OUT_BASE = path.join(ROOT, "data", "raw", "duka", INSTR.toUpperCase());

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function csvExists(dir) {
  try { return fs.readdirSync(dir).some(f => f.endsWith(".csv")); }
  catch { return false; }
}
function monthList(fromYYYYMM, toYYYYMM) {
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

function runNodeRunner(from, to, outDir) {
  const args = [
    "dukascopy-node",
    "--instrument", INSTR,
    "--timeframe", TF,
    "--date-from", from,
    "--date-to", to,
    "--format", PRICE_FMT,
    "--directory", outDir
    // NOTE: no --quiet, no --retries (we implement retries ourselves)
  ];
  const env = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=512",
    NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org/"
  };
  execFileSync("npx", args, { stdio: "inherit", env });
}

async function main() {
  console.log(`Downloading ${INSTR} ${FROM_M}..${TO_M}  ->  ${OUT_BASE}`);
  ensureDir(OUT_BASE);
  const months = monthList(FROM_M, TO_M);

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

    console.log(`\n> downloading ${INSTR} ${ym}`);
    console.log(`Instrument=${INSTR} timeframe=${TF} from=${from} to=${to} format=${PRICE_FMT}`);
    let attempts = 0, ok = false, lastErr = null;

    while (attempts < 3 && !ok) {
      attempts++;
      try {
        console.log(`[runner] dukascopy-node (attempt ${attempts}/3)`);
        runNodeRunner(from, to, outDir);
        ok = true;
      } catch (e) {
        lastErr = e;
        console.warn(`[runner] dukascopy-node failed (attempt ${attempts})`);
        // tiny backoff
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
