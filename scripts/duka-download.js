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

function runNPX(args) {
  const env = {
    ...process.env,
    NODE_OPTIONS: "--max-old-space-size=256",
    // force the official registry (avoid broken mirrors)
    NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org/"
  };
  return execFileSync("npx", args, { stdio: "inherit", env });
}

function hasLocalBin(binName) {
  const p = path.join(ROOT, "node_modules", ".bin", binName);
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

async function main() {
  console.log(`Downloading ${INSTR} ${FROM_M}..${TO_M}  ->  ${OUT_BASE}`);
  ensureDir(OUT_BASE);
  const months = monthList(FROM_M, TO_M);

  // prefer dukascopy-node first (no version fetch at runtime)
  const runners = [
    { kind: "node",    npxArgs: (from, to, outDir) => [
        "dukascopy-node",
        "--instrument", INSTR, "--timeframe", TF,
        "--date-from", from, "--date-to", to,
        "--format", PRICE_FMT, "--directory", outDir, "--quiet"
      ]},
    // if user installed dukascopy-cli locally, use that (no registry fetch)
    { kind: "cli-local", npxArgs: (from, to, outDir) => [
        // this only works if devDependency is installed
        "dukascopy-cli",
        "--instrument", INSTR, "--timeframe", TF,
        "--date-from", from, "--date-to", to,
        "--format", PRICE_FMT, "--directory", outDir, "--quiet", "--retries", "2"
      ], requireLocal: "dukascopy-cli" },
    // last resort: grab via npx, which may hit registry “notarget”
    { kind: "cli-latest", npxArgs: (from, to, outDir) => [
        "--yes", "--package", "dukascopy-cli@latest",
        "dukascopy-cli",
        "--instrument", INSTR, "--timeframe", TF,
        "--date-from", from, "--date-to", to,
        "--format", PRICE_FMT, "--directory", outDir, "--quiet", "--retries", "2"
      ]}
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
    console.log(`Instrument=${INSTR} timeframe=${TF} from=${from} to=${to} format=${PRICE_FMT}`);

    let ok = false;
    for (const r of runners) {
      if (r.requireLocal && !hasLocalBin(r.requireLocal)) {
        // skip local runner if not installed
        continue;
      }
      try {
        console.log(`[runner] ${r.kind}`);
        runNPX(r.npxArgs(from, to, outDir));
        ok = true;
        break;
      } catch (e) {
        console.warn(`[runner] ${r.kind} failed, trying next…`);
      }
    }

    if (!ok) throw new Error(`All download runners failed for ${INSTR} ${ym}`);
  }

  console.log("\n✓ Duka download complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
