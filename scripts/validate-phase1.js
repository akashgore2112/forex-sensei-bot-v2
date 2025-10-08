// scripts/validate-phase1.js
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, "cache/json");

// Max indicator lookback; keep generous to be safe
const WARMUP = 200; // skip first 200 bars for NaN checks

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function checkCount(file, min, max) {
  const data = readJson(file);
  const arr = Array.isArray(data) ? data : data.candles ?? [];
  const n = arr.length;
  if (n < min || n > max) {
    throw new Error(`Count out of range: ${path.basename(file)} → ${n} (need ${min}..${max})`);
  }
  console.log(`✔ count OK: ${path.basename(file)} = ${n}`);
}

function checkNaN(file, warmup = WARMUP) {
  const data = readJson(file);
  const arr = Array.isArray(data) ? data : data.candles ?? [];
  const start = Math.min(warmup, Math.floor(arr.length * 0.2)); // robust skip

  for (let i = start; i < arr.length; i++) {
    const c = arr[i] || {};
    const nums = [
      c.open, c.high, c.low, c.close, c.volume,
      ...(c.ind ? Object.values(c.ind) : [])
    ];
    if (nums.some(v => Number.isNaN(v))) {
      throw new Error(`Indicators NaN at index ${i} in ${path.basename(file)}`);
    }
  }
  console.log(`✔ NaN check OK: ${path.basename(file)} (skipped first ${start})`);
}

function run() {
  const f1D  = path.join(CACHE, "EUR-USD_1D.json");
  const f4H  = path.join(CACHE, "EUR-USD_4H.json");
  const f1H  = path.join(CACHE, "EUR-USD_1H.json");

  // 2 saal target ranges (approx)
  checkCount(f1D,  520,  560);
  checkCount(f4H, 4300, 4600);
  checkCount(f1H, 17500, 18500);

  // Warm-up skip ke baad NaN check
  checkNaN(f1D);
  checkNaN(f4H);
  checkNaN(f1H);

  console.log("\n✅ Phase 1 validate PASSED");
}

run();
