// scripts/duka-download.js  (ESM)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// -------- config/env --------
const INSTR = (process.env.INSTRUMENT || "EURUSD").toLowerCase();
const FROM_M = process.env.DUKA_FROM_MONTH || "2023-01"; // YYYY-MM
const TO_M = process.env.DUKA_TO_MONTH || "2023-12";     // YYYY-MM
const TF = process.env.DUKA_TIMEFRAME || "m1";           // m1 by default
const PRICE_FMT = "csv";                                  // csv/json/array
const BASE_OUT = path.resolve(`data/raw/duka/${INSTR.toUpperCase()}`);

// -------- helpers --------
function* monthRange(ymStart, ymEnd) {
  const [ys, ms] = ymStart.split("-").map(Number);
  const [ye, me] = ymEnd.split("-").map(Number);
  let y = ys, m = ms;
  while (y < ye || (y === ye && m <= me)) {
    yield `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
}

function monthStartEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${ym}-${last.toString().padStart(2, "0")}`;
  return { from, to };
}

function run(cmd, args, cwd = process.cwd()) {
  // prints live output; throws on non-zero exit
  execFileSync(cmd, args, { stdio: "inherit", cwd });
}

// -------- main --------
console.log(
  `Symbol: ${INSTR.toUpperCase()}, months: ${FROM_M} → ${TO_M}, out: ${BASE_OUT}, tf: ${TF}`
);

for (const ym of monthRange(FROM_M, TO_M)) {
  const { from, to } = monthStartEnd(ym);
  const outDir = path.join(BASE_OUT, ym);
  fs.mkdirSync(outDir, { recursive: true });

  // Prefer dukascopy-node CLI (built-in)
  const args = [
    "--yes", "dukascopy-node@latest",
    "--instrument", INSTR,               // NOTE: lowercase instrument
    "--timeframe", TF,
    "--date-from", from,
    "--date-to", to,
    "--format", PRICE_FMT,
    "--directory", outDir
  ];

  console.log(`\n▶ downloading ${INSTR.toUpperCase()} ${TF}  ${from}..${to}`);
  try {
    run("npx", args);
  } catch (e) {
    console.warn("dukascopy-node failed, trying dukascopy-cli …");
    // Fallback flags are same according to help
    const alt = [
      "--yes", "dukascopy-cli@latest",
      "--instrument", INSTR,
      "--timeframe", TF,
      "--date-from", from,
      "--date-to", to,
      "--format", PRICE_FMT,
      "--directory", outDir
    ];
    run("npx", alt);
  }
}

console.log("\n✅ Duka download complete.");
