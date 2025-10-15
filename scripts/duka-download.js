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
  const env = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=256",
    // force official registry to avoid mirrors that miss versions
    NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org/"
  };
  return execFileSync("npx", args, { stdio: "inherit", env });
}

function csvExists(dir) {
  try { return fs.readdirSync(dir).some((f) => f.endsWith(".csv")); }
  catch { return false; }
}

async function main() {
  const months = monthList(FROM_M, TO_M);
  console.log(`Downloading ${INSTR} ${months[0]}..${months.at(-1)}  ->  ${OUT_BASE}`);
  ensureDir(OUT_BASE);

  // Try a few package versions in order
  const versions = [
    process.env.DUKA_CLI_VERSION || "1.6.2", // primary fallback known to exist widely
    "latest"
  ];

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
    console.log(`Instrument: ${INSTR}  TF: ${TF}  from: ${from}  to: ${to}  format: ${PRICE_FMT}`);

    let ok = false;
    for (const ver of versions) {
      // Use --package to pin the exact package that provides the binary
      const args = [
        "--yes",
        "--package", `dukascopy-cli@${ver}`,
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
        console.log(`[npx] trying dukascopy-cli@${ver}`);
        runNPX(args);
        ok = true;
        break;
      } catch (e) {
        console.warn(`[npx] dukascopy-cli@${ver} failed, will try next candidate…`);
      }
    }

    if (!ok) {
      throw new Error(`All dukascopy-cli versions failed for ${INSTR} ${ym}`);
    }
  }

  console.log("\n✓ Duka download complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
