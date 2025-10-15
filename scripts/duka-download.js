// scripts/duka-download.js
// Robust Dukascopy monthly downloader with smart runner fallback:
// - FX: try dukascopy-node
// - Commodities/indices or "instrument not allowed": auto-fallback to dukascopy-cli@latest

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js"; // load .env

// --------- env ---------
const INSTR = process.env.INSTRUMENT?.trim();       // e.g. EURUSD, GBPUSD, BRENT.CMD/USD
const SYMBOL = (process.env.SYMBOL_OUT || INSTR || "EURUSD")
  .replaceAll("/", "-")
  .toUpperCase();
const TF     = (process.env.DUKA_TIMEFRAME || "m1").trim();
const FROM_M = (process.env.DUKA_FROM_MONTH || "2023-01").trim(); // YYYY-MM
const TO_M   = (process.env.DUKA_TO_MONTH   || "2025-10").trim();

if (!INSTR) {
  console.error("ERROR: INSTRUMENT is not set (e.g. EURUSD or BRENT.CMD/USD).");
  process.exit(1);
}

// base dirs (same layout you already use)
const ROOT = process.cwd();
const OUT_BASE = path.join(ROOT, "data", "raw", "duka", SYMBOL);

// helper: list months inclusive between FROM_M..TO_M
function* monthRange(fromYyyyMm, toYyyyMm) {
  const [fy, fm] = fromYyyyMm.split("-").map(Number);
  const [ty, tm] = toYyyyMm.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, "0")}`;
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
}

// date helpers (UTC month bounds)
function monthStart(mStr) { return new Date(`${mStr}-01T00:00:00.000Z`); }
function monthEndISO(mStr) {
  const [y, m] = mStr.split("-").map(Number);
  const next = (m === 12) ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,"0")}`;
  return new Date(`${next}-01T00:00:00.000Z`).toISOString().replace(".000Z","").replace("Z","Z").replace(".000Z","Z").slice(0, -1) + "Z";
}

// detect “commodities/indices” → often missing in dukascopy-node’s enum
const looksLikeCommodity = /\.CMD\//i.test(INSTR) || /\.IDX\//i.test(INSTR);

// run a single attempt with a given runner
function runWith(runner, { instrument, timeframe, fromISO, toISO, outDir }) {
  const argsCommon = [
    "--instrument", instrument,
    "--timeframe", timeframe,
    "--date-from", fromISO,
    "--date-to", toISO,
    "--format", "csv",
    "--directory", outDir,
  ];

  // dukascopy-node args:
  if (runner === "node") {
    // dukascopy-node is tolerant to these options; we avoid unknown flags
    return execFileSync("npx", ["--yes", "dukascopy-node@latest", ...argsCommon], {
      stdio: "pipe",
      env: process.env,
    }).toString();
  }

  // dukascopy-cli args:
  if (runner === "cli") {
    // Avoid flags that older CLI doesn’t recognize; keep it minimal & reliable.
    return execFileSync("npx", ["--yes", "dukascopy-cli@latest", ...argsCommon], {
      stdio: "pipe",
      env: {
        ...process.env,
        // help prevent OOM on low-RAM devices when CLI spawns Node
        NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
      },
    }).toString();
  }

  throw new Error(`Unknown runner: ${runner}`);
}

// resilient download for one month
function downloadOneMonth(monthStr) {
  const fromISO = monthStart(monthStr).toISOString();
  const toISO   = monthEndISO(monthStr);

  const outDir = path.join(OUT_BASE, monthStr);
  fs.mkdirSync(outDir, { recursive: true });

  // file existence heuristic (your CSV names may differ; we use dir presence only)
  // Always run: Dukascopy can return partials; your build step tolerates duplicates.
  const header = `downloading ${SYMBOL.toLowerCase()} ${monthStr} -> ${outDir}`;
  console.log("\n>>", header);
  console.log("Instrument=", INSTR, "timeframe", TF, "from", fromISO, "to", toISO, "format=csv");

  // Decide primary runner
  const primary = looksLikeCommodity ? "cli" : "node";
  const secondary = looksLikeCommodity ? "node" : "cli";

  const tryOrder = [primary, secondary];

  let lastErr = null;
  for (let i = 0; i < tryOrder.length; i++) {
    const runner = tryOrder[i];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[runner] ${runner} (attempt ${attempt}/3)`);
        const out = runWith(runner, {
          instrument: INSTR,
          timeframe: TF,
          fromISO,
          toISO,
          outDir,
        });
        // success if no throw
        if (out?.trim()) console.log(out.trim().split("\n").slice(-3).join("\n"));
        return; // this month done
      } catch (e) {
        const msg = String(e?.stderr || e?.stdout || e?.message || e);
        const short = msg.split("\n").slice(-6).join("\n");
        console.error(short);

        // If node says instrument not allowed → jump straight to CLI
        if (runner === "node" && /instrument.*does not match any of the allowed values/i.test(msg)) {
          console.warn("node runner rejected instrument; switching to cli for this month.");
          break; // break attempts loop, go to next runner (cli)
        }

        lastErr = e;
      }
    }
    // continue to next runner if we broke out due to enum issue
  }

  throw new Error(`All download attempts failed for ${SYMBOL} ${monthStr}`);
}

// ------------ main ------------
console.log(`\nDuka download: ${INSTR} (${SYMBOL})  ${FROM_M}..${TO_M}  timeframe=${TF}`);
for (const m of monthRange(FROM_M, TO_M)) {
  downloadOneMonth(m);
}
console.log("\n✓ Duka download complete.");
