// scripts/duka-download.js
// Robust Dukascopy downloader with multiple fallbacks (+ optional local mode)

import "../src/utils/env.js";
import fs from "fs";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- Inputs (env) ----
const INSTR = (process.env.INSTRUMENT || "EURUSD").toLowerCase();   // eurusd
const FROM_M = process.env.DUKA_FROM_MONTH || "2023-08";            // YYYY-MM
const TO_M   = process.env.DUKA_TO_MONTH   || "2025-10";
const TF     = process.env.DUKA_TIMEFRAME  || "m1";                 // m1/m5/...
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", INSTR.toUpperCase());
const USE_LOCAL = process.env.DUKA_LOCAL_CLI === "1";               // optional

// ---- Utils ----
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function monthList(fromYYYYMM, toYYYYMM) {
  const [fy, fm] = fromYYYYMM.split("-").map(Number);
  const [ty, tm] = toYYYYMM.split("-").map(Number);
  const out = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
function csvExists(dir) {
  try { return fs.readdirSync(dir).some(f => f.endsWith(".csv")); }
  catch { return false; }
}

function runLocal(binName, args) {
  const bin = path.join(ROOT, "node_modules", ".bin", binName);
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" };
  console.log(`[local] ${bin} ${args.join(" ")}`);
  execFileSync(bin, args, { stdio: "inherit", env });
}

function runNPX(pkg, args) {
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" };
  console.log(`[npx] ${pkg} ${args.join(" ")}`);
  execFileSync("npx", ["--yes", pkg, ...args], { stdio: "inherit", env });
}

// ---- Main ----
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
    const baseArgs = [
      "--instrument", INSTR,
      "--timeframe", TF,
      "--date-from", from,
      "--date-to", to,
      "--format", "csv",
      "--directory", outDir,
      "--quiet",
      "--retries", "2",
    ];

    // candidate runners (ordered)
    const candidates = USE_LOCAL
      ? [
          { kind: "local", bin: "dukascopy-cli", args: baseArgs },
          { kind: "local", bin: "dukascopy",     args: baseArgs },
        ]
      : [
          { kind: "npx", pkg: "dukascopy-cli@latest", args: baseArgs },
          { kind: "npx", pkg: "dukascopy@latest",     args: baseArgs },
          { kind: "npx", pkg: "github:Leo4815162342/dukascopy-cli", args: baseArgs },
        ];

    let ok = false, lastErr = null;
    for (const c of candidates) {
      try {
        if (c.kind === "local") runLocal(c.bin, c.args);
        else runNPX(c.pkg, c.args);
        ok = true;
        console.log(`[ok] using ${c.kind === "local" ? c.bin : c.pkg}`);
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[warn] runner failed: ${c.kind === "local" ? c.bin : c.pkg}`);
      }
    }
    if (!ok) {
      console.error(lastErr);
      throw new Error(`All runners failed for ${INSTR.toUpperCase()} ${ym}`);
    }
  }
  console.log("\n✓ Duka download complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
