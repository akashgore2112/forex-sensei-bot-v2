// scripts/refresh_last.js
// Normalize "reports/daily/.last": for each symbol, copy the newest signals_*.json,
// add a "latest" timestamp if missing, and write a digest.txt with latestBy + latest.
// Usage:
//   node scripts/refresh_last.js --symbols="EUR-USD,GBP-USD,USD-JPY"

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const arg = (name, def = null) => {
  const m = process.argv.join(" ").match(new RegExp(`--${name}="?([^"\\s]+)"?`));
  return m ? m[1] : def;
};
const SYMBOLS = (arg("symbols", "EUR-USD,GBP-USD,USD-JPY"))
  .split(",").map(s => s.trim()).filter(Boolean);

const exists = p => { try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; } };
const ensureDir = p => fs.mkdirSync(p, { recursive: true });
const readJSON = p => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));

const repoRoot   = path.join(__dirname, "..");
const dailyRoot  = path.join(repoRoot, "reports", "daily");
const lastDir    = path.join(dailyRoot, ".last");

function listDatedDaily() {
  if (!exists(dailyRoot)) return [];
  return fs.readdirSync(dailyRoot)
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))
    .sort(); // oldest..newest
}

// try to find newest signals file for symbol, newest-first
function findNewestSignals(symbol) {
  const dated = listDatedDaily().reverse(); // newest..oldest
  for (const d of dated) {
    const p = path.join(dailyRoot, d, `signals_${symbol}.json`);
    if (exists(p)) return { path: p, date: d };
  }
  return null;
}

// extract a timestamp (ms) from typical shapes
function latestSignalMs(obj) {
  const ts = [];
  if (obj?.latest) ts.push(new Date(obj.latest).getTime());

  const pushFrom = arr => Array.isArray(arr) && arr.forEach(s => s?.entry && ts.push(new Date(s.entry).getTime()));
  pushFrom(obj?.lastSignals);
  pushFrom(obj?.signals);
  pushFrom(obj?.events);

  if (obj?.summary?.lastSignalTime) ts.push(new Date(obj.summary.lastSignalTime).getTime());
  if (obj?.lastSignal) ts.push(new Date(obj.lastSignal).getTime());

  return ts.length ? Math.max(...ts) : null;
}

function iso(d) { return new Date(d).toISOString(); }

function main() {
  ensureDir(lastDir);

  const latestBy = {};
  const srcBy    = {};

  for (const sym of SYMBOLS) {
    const found = findNewestSignals(sym);
    if (!found) {
      // create a tiny stub so downstream tools don’t break
      const out = { symbol: sym, latest: null, note: "no signals file found in dated daily folders" };
      writeJSON(path.join(lastDir, `signals_${sym}.json`), out);
      latestBy[sym] = null;
      srcBy[sym] = "(none)";
      console.log(`[refresh_last] ${sym}: wrote stub (no history)`);
      continue;
    }

    let obj;
    try {
      obj = readJSON(found.path);
    } catch {
      obj = {};
    }

    // compute latest if missing
    let t = latestSignalMs(obj);
    if (!obj.latest && t) obj.latest = iso(t);

    // If still no timestamp, at least tag with the source day
    if (!obj.latest) obj.latest = found.date + "T00:00:00.000Z";

    // Write to .last
    const outPath = path.join(lastDir, `signals_${sym}.json`);
    writeJSON(outPath, obj);

    latestBy[sym] = obj.latest || null;
    srcBy[sym]    = found.path.replace(repoRoot + path.sep, "");
    console.log(`[refresh_last] ${sym}: source=${srcBy[sym]} -> .last/signals_${sym}.json (latest=${latestBy[sym]})`);
  }

  // digest: overall latest across symbols
  const allMs = Object.values(latestBy)
    .filter(Boolean)
    .map(s => new Date(s).getTime());
  const overall = allMs.length ? iso(Math.max(...allMs)) : null;

  const digest = {
    runOn: iso(Date.now()),
    base: ".last",
    latest: overall,
    latestBy
  };
  writeJSON(path.join(lastDir, "digest.txt"), digest);
  console.log(`[refresh_last] wrote digest: latest=${digest.latest}`);
}

main();
