// Robust Dukascopy monthly downloader with alias → canonical instrument mapping.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js";

// ---------- env ----------
const INSTR_RAW = process.env.INSTRUMENT?.trim();            // e.g. EURUSD, BRENT, BRENT.CMD/USD
const TF        = (process.env.DUKA_TIMEFRAME || "m1").trim();
const FROM_M    = (process.env.DUKA_FROM_MONTH || "2023-08").trim();
const TO_M      = (process.env.DUKA_TO_MONTH   || "2025-10").trim();

if (!INSTR_RAW) {
  console.error("ERROR: INSTRUMENT env is required (e.g. EURUSD, GBPUSD, BRENT, BRENT.CMD/USD)");
  process.exit(1);
}

// ---------- alias → canonical mapping ----------
function normKey(s) {
  return s.toLowerCase()
    .replaceAll("-", "")
    .replaceAll("_", "")
    .replaceAll(".", "")
    .replaceAll("/", "");
}

// Dukascopy canonical ids (lowercase)
const ALIASES = {
  // Brent
  "brent": "brentcmdusd",
  "brentcmdusd": "brentcmdusd",
  "brentcmdusd": "brentcmdusd",
  "brentcmddusd": "brentcmdusd",
  "brentcmduusd": "brentcmdusd",
  "brentcmduusds": "brentcmdusd",
  "brentcmdusdusd": "brentcmdusd",
  "brentcmdu": "brentcmdusd",
  "brentcmd": "brentcmdusd",
  // common typed variants
  "brentcmdusd": "brentcmdusd",
  "brentcmddusd": "brentcmdusd",
  "brentcmdusdusd": "brentcmdusd",
  "brentcmdus": "brentcmdusd",
  "brentcmduusd": "brentcmdusd",
  // with separators removed
  "brentcmdusd": "brentcmdusd",
  "brentcmdusd": "brentcmdusd",

  // WTI
  "wti": "wticmdusd",
  "wticmdusd": "wticmdusd",
  "wticmd": "wticmdusd",
  "wticmdus": "wticmdusd",

  // Metals (examples)
  "xauusd": "xauusd",
  "xagusd": "xagusd",
};

function toDukaCode(input) {
  const k = normKey(input);
  if (ALIASES[k]) return ALIASES[k];
  // FX pairs fall back to lowercase as-is (eurusd, gbpusd, usdjpy, …)
  return input.toLowerCase();
}

// use SYMBOL_OUT for folder name if given, else from input
const SYMBOL = (process.env.SYMBOL_OUT || INSTR_RAW).replaceAll("/", "-").toUpperCase();
const DUKA_CODE = toDukaCode(INSTR_RAW);

// commodities/indices: prefer CLI
const looksLikeCommodity = /(cmd|\.cmd\/|\.idx\/)/i.test(INSTR_RAW) ||
                           /^(brent|wti)$/i.test(INSTR_RAW);

// ---------- paths ----------
const ROOT = process.cwd();
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", SYMBOL);

// ---------- utils ----------
function* monthRange(fromYyyyMm, toYyyyMm) {
  const [fy, fm] = fromYyyyMm.split("-").map(Number);
  const [ty, tm] = toYyyyMm.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, "0")}`;
    m++; if (m === 13) { m = 1; y++; }
  }
}
const startISO = m => `${m}-01T00:00:00.000Z`;
function endISO(m) {
  const [y, mo] = m.split("-").map(Number);
  const ny = mo === 12 ? y + 1 : y;
  const nmo = mo === 12 ? 1 : mo + 1;
  return `${ny}-${String(nmo).padStart(2, "0")}-01T00:00:00.000Z`;
}

// ---------- runners ----------
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

function runCli({ instrument, timeframe, fromISO, toISO, outDir }) {
  const baseArgs = [
    "--instrument", instrument,
    "--timeframe", timeframe,
    "--date-from", fromISO,
    "--date-to", toISO,
    "--format", "csv",
    "--directory", outDir,
  ];
  const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048" };
  const variants = [
    ["--yes", "dukascopy-cli@latest", ...baseArgs],
    ["--yes", "-p", "dukascopy-cli@latest", "dukascopy-cli", ...baseArgs],
    ["--yes", "-p", "dukascopy-cli@latest", "dukascopy", ...baseArgs],
    ["--yes", "-p", "dukascopy@latest", "dukascopy", ...baseArgs],
  ];
  let lastErr;
  for (const v of variants) {
    try { return execFileSync("npx", v, { stdio: "pipe", env }).toString(); }
    catch (e) {
      lastErr = e;
      const msg = String(e?.stderr || e?.stdout || e?.message || e);
      console.error("[cli variant failed tail]\n" + msg.split("\n").slice(-6).join("\n"));
    }
  }
  throw lastErr;
}

function downloadMonth(m) {
  const fromISO = startISO(m);
  const toISO = endISO(m);
  const outDir = path.join(OUT_BASE, m);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n>> downloading ${SYMBOL.toLowerCase()} ${m} -> ${outDir}`);
  console.log("DUKA_CODE=", DUKA_CODE, "raw=", INSTR_RAW, "timeframe", TF, "from", fromISO, "to", toISO, "format=csv");

  const primary = looksLikeCommodity ? "cli" : "node";
  const secondary = looksLikeCommodity ? "node" : "cli";
  const order = [primary, secondary];

  let lastErr = null;

  for (const runner of order) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[runner] ${runner} (attempt ${attempt}/3)`);
        const out = runner === "node"
          ? runNode({ instrument: DUKA_CODE, timeframe: TF, fromISO, toISO, outDir })
          : runCli({ instrument: DUKA_CODE, timeframe: TF, fromISO, toISO, outDir });
        if (out?.trim()) console.log(out.trim().split("\n").slice(-3).join("\n"));
        return;
      } catch (e) {
        const msg = String(e?.stderr || e?.stdout || e?.message || e);
        console.error(msg.split("\n").slice(-10).join("\n"));
        // if node complains invalid instrument, move to cli
        if (runner === "node" && /instrument.*allowed values/i.test(msg)) break;
        lastErr = e;
      }
    }
  }
  throw new Error(`All download attempts failed for ${SYMBOL} ${m}`);
}

// ---------- main ----------
console.log(`\nDuka download: ${INSTR_RAW} → ${DUKA_CODE}  ${FROM_M}..${TO_M}  timeframe=${TF}`);
for (const m of monthRange(FROM_M, TO_M)) downloadMonth(m);
console.log("\n✓ Duka download complete.");
