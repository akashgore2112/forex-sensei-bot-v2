// scripts/validate-phase1.js
import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "cache", "json");

// Optional filter: SYMBOLS="EUR-USD,GBP-USD"
const FILTER = (process.env.SYMBOLS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean); // e.g. ["EUR-USD","GBP-USD"]

// bounds (≈ ~2y)
const BOUNDS = {
  "1D": { min: 520, max: 560 },
  "4H": { min: 3000, max: 3300 },
  "1H": { min: 12000, max: 14000 },
};

function listSymbolFiles() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  const all = fs.readdirSync(CACHE_DIR);
  // match AAA-BBB_1H.json etc (FX only by design)
  const rx = /^([A-Z]{3}-[A-Z]{3})_(1H|4H|1D)\.json$/;
  const map = new Map();
  for (const f of all) {
    const m = f.match(rx);
    if (!m) continue;
    const [_, base, tf] = m;
    if (FILTER.length && !FILTER.includes(base)) continue;
    const entry = map.get(base) || {};
    entry[tf] = path.join(CACHE_DIR, f);
    map.set(base, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b));
}

function readCandles(fp) {
  const j = JSON.parse(fs.readFileSync(fp, "utf8"));
  return j.candles || [];
}

function fmtLine(base, tf, candles) {
  const first = candles[0]?.time ?? "NaN";
  const last  = candles.at(-1)?.time ?? "NaN";
  const count = candles.length;
  const { min, max } = BOUNDS[tf] || { min: 0, max: Infinity };
  const ok = count >= min && count <= max ? "OK" : `OUT(${min}..${max})`;
  return ` • ${base}_${tf}.json: count=${count} [${ok}], first=${first}, last=${last}`;
}

function main() {
  console.log("Phase-1 validate (multi-symbol)");

  const entries = listSymbolFiles();
  if (entries.length === 0) {
    console.log("No symbol JSON found in cache/json. Did you run the build?");
    process.exit(1);
  }

  for (const [base, files] of entries) {
    console.log(`\n${base}`);
    for (const tf of ["1D", "4H", "1H"]) {
      const fp = files[tf];
      if (!fp) {
        console.log(` • ${base}_${tf}.json: MISSING`);
        continue;
      }
      const candles = readCandles(fp);
      console.log(fmtLine(base, tf, candles));
      if (!candles.length || !candles[0]?.time || !candles.at(-1)?.time) {
        console.error(`   !! Bad timestamp in ${fp}`);
        process.exitCode = 2;
      }
    }
  }
  console.log("\n✅ Phase-1 validate done");
}

main();
