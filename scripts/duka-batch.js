// scripts/duka-batch.js
// Multi-symbol batch: download -> build -> (optional) validate
// Env:
//   INSTRUMENTS="EURUSD,GBPUSD,USDJPY"   (comma or space separated)
//   DUKA_FROM_MONTH=2023-01
//   DUKA_TO_MONTH=2025-12
//   DUKA_TIMEFRAME=m1
//   VALIDATE=yes|no
//
// Scripts this calls:
//   node scripts/duka-download.js   (per symbol via INSTRUMENT)
//   node scripts/build-candles.js   (writes data/candles/duka + cache/json)
//   node scripts/validate-phase1.js (optional)

import "../src/utils/env.js";
import { execSync } from "node:child_process";

const INSTRUMENTS =
  (process.env.INSTRUMENTS || process.env.SYMBOLS || "EURUSD")
    .split(/[,\s]+/).filter(Boolean);

const fromM = process.env.DUKA_FROM_MONTH || "2023-01";
const toM   = process.env.DUKA_TO_MONTH   || "2025-12";
const tf    = process.env.DUKA_TIMEFRAME  || "m1";
const doValidate = String(process.env.VALIDATE || "yes").toLowerCase().startsWith("y");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=256" } });
}

(async function main() {
  console.log(">>> Batch start");
  console.log("SYMS:", INSTRUMENTS.join(", "));
  console.log("FROM..TO:", fromM, "->", toM);
  console.log("TIMEFRAME:", tf);
  console.log("VALIDATE?", doValidate ? "yes" : "no");

  for (const sym of INSTRUMENTS) {
    console.log(`\n--- ${sym} :: DOWNLOAD ---`);
    run(`INSTRUMENT=${sym} DUKA_FROM_MONTH=${fromM} DUKA_TO_MONTH=${toM} DUKA_TIMEFRAME=${tf} node scripts/duka-download.js`);

    console.log(`\n--- ${sym} :: BUILD ---`);
    // build-candles reads raw/<SYMBOL> dir and writes to data/candles + cache/json
    run(`SYMBOL_ENV=${sym.toUpperCase()} node scripts/build-candles.js`);

    if (doValidate) {
      console.log(`\n--- ${sym} :: VALIDATE ---`);
      run("node scripts/validate-phase1.js");
    }
  }

  console.log("\n>>> Batch done ✓");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
