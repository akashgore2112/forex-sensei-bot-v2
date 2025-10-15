// ESM
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js"; // loads .env

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "data", "raw", "duka-commod"); // separate bucket

const SYMS = (process.env.INSTRUMENTS_COMMOD || "").split(",").map(s => s.trim()).filter(Boolean);
const FROM_M = process.env.DUKA_FROM_MONTH_COMMOD || "2023-08";
const TO_M   = process.env.DUKA_TO_MONTH_COMMOD   || "2025-10";
const TF     = process.env.DUKA_TIMEFRAME_COMMOD  || "m1";

if (SYMS.length === 0) {
  console.error("No commodities set. Add INSTRUMENTS_COMMOD=brent[,wti] in .env");
  process.exit(1);
}

function months(from, to) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out = [];
  for (let y = fy; y <= ty; y++) {
    const startM = (y === fy ? fm : 1), endM = (y === ty ? tm : 12);
    for (let m = startM; m <= endM; m++) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function runNPX(args) {
  return execFileSync("npx", args, { stdio: "inherit" });
}

function downloadOne(symbol, yyyymm) {
  const [Y, M] = yyyymm.split("-");
  const start = `${Y}-${M}-01T00:00:00.000Z`;
  // month-end 23:59:59Z; dukascopy accepts inclusive end for most runners
  const end   = new Date(Date.UTC(+Y, +M, 0, 23, 59, 59)).toISOString();

  const outDir = path.join(OUT_ROOT, symbol.toUpperCase(), yyyymm);
  ensureDir(outDir);

  const common = [
    "--instrument", symbol,
    "--timeframe", TF,
    "--date-from", start,
    "--date-to", end,
    "--format", "csv",
    "--directory", outDir
  ];

  // Prefer dukascopy-node (includes cli now)
  try {
    runNPX(["--yes", "dukascopy-node@latest", ...common]);
    return;
  } catch (_) {}

  // Fallback dukascopy-cli (older)
  try {
    runNPX(["--yes", "dukascopy-cli@latest", ...common]);
    return;
  } catch (e) {
    console.error("Both dukascopy-node & dukascopy-cli failed for", symbol, yyyymm);
    throw e;
  }
}

for (const sym of SYMS) {
  console.log(`\n⇢ COMMOD download :: ${sym.toUpperCase()}  ${FROM_M} … ${TO_M}  →  ${OUT_ROOT}/${sym.toUpperCase()}`);
  for (const mm of months(FROM_M, TO_M)) {
    const dir = path.join(OUT_ROOT, sym.toUpperCase(), mm);
    const has = fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith(".csv"));
    if (has) {
      console.log(`${sym} ${mm}: already has CSV  → skip`);
      continue;
    }
    console.log(`downloading ${sym} ${mm} → ${dir}`);
    downloadOne(sym, mm);
  }
}
console.log("\n✓ COMMOD download complete.");
