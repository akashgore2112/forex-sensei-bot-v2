// scripts/weekly_guard.js
// Weekly guard — reads latest signal time from reports/daily/_last/signals_*.json (flexible shapes)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- utils ----------------
const arg = (name, def = null) => {
  const m = process.argv.join(" ").match(new RegExp(`--${name}="?([^"\\s]+)"?`));
  return m ? m[1] : def;
};
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const exists = (p) => { try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; } };
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const iso = (d) => new Date(d).toISOString().slice(0, 10);

const now = new Date();
const WEEKS = parseInt(arg("weeks", "12"), 10);
const SYMBOLS = (arg("symbols", "EUR-USD,GBP-USD,USD-JPY"))
  .split(",").map(s => s.trim()).filter(Boolean);
const cutoffMs = now.getTime() - WEEKS * 7 * 24 * 3600 * 1000;

const dailyRoot = path.join(__dirname, "..", "reports", "daily");
let lastDir = path.join(dailyRoot, "_last");
if (!exists(lastDir)) {
  // fallback to newest YYYY-MM-DD folder
  const entries = exists(dailyRoot) ? fs.readdirSync(dailyRoot)
    .filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort() : [];
  if (entries.length === 0) {
    console.error("[weekly_guard] ERROR: no daily reports found. Run daily-scan first.");
    process.exit(1);
  }
  lastDir = path.join(dailyRoot, entries[entries.length - 1]);
}

// Grab the latest signal time from flexible JSON shapes
function latestSignalMs(obj) {
  const candidates = [];

  // new minimal summary uses "latest"
  if (obj?.latest) candidates.push(new Date(obj.latest).getTime());

  // common arrays
  if (Array.isArray(obj?.lastSignals))
    for (const s of obj.lastSignals) if (s?.entry) candidates.push(new Date(s.entry).getTime());

  if (Array.isArray(obj?.signals))
    for (const s of obj.signals) if (s?.entry) candidates.push(new Date(s.entry).getTime());

  if (Array.isArray(obj?.events))
    for (const e of obj.events) if (e?.entry) candidates.push(new Date(e.entry).getTime());

  // summaries
  if (obj?.summary?.lastSignalTime) candidates.push(new Date(obj.summary.lastSignalTime).getTime());
  if (obj?.lastSignal) candidates.push(new Date(obj.lastSignal).getTime());

  return candidates.length ? Math.max(...candidates) : null;
}

// ---------------- run ----------------
const weeklyOutDir = path.join(__dirname, "..", "reports", "weekly");
ensureDir(weeklyOutDir);

const jsonOut = {
  date: iso(now),
  weeks: WEEKS,
  symbols: {},
};

const lines = [];
for (const sym of SYMBOLS) {
  const file = path.join(lastDir, `signals_${sym}.json`);
  let status = "BORDERLINE";
  let lastIso = null;

  if (exists(file)) {
    try {
      const obj = readJSON(file);
      const t = latestSignalMs(obj);
      if (t) {
        lastIso = new Date(t).toISOString();
        if (t >= cutoffMs) status = "OK";
      }
    } catch (e) {
      status = "ERROR";
      lastIso = `parse-failed: ${e.message}`;
    }
  } else {
    status = "MISSING";
  }

  jsonOut.symbols[sym] = { status, lastSignal: lastIso };
  lines.push(`${sym}: ${status}${lastIso ? ` — last=${lastIso}` : ""}`);
}

const fnBase = `weekly_${iso(now)}`;
fs.writeFileSync(path.join(weeklyOutDir, `${fnBase}.json`), JSON.stringify(jsonOut, null, 2));
fs.writeFileSync(path.join(weeklyOutDir, `${fnBase}.txt`), `${fnBase}\nweeks=${WEEKS}\n\n${lines.join("\n")}\n`);

console.log("[weekly_guard] wrote:");
console.log(`  reports/weekly/${fnBase}.json`);
console.log(`  reports/weekly/${fnBase}.txt`);
for (const [sym, info] of Object.entries(jsonOut.symbols)) {
  console.log(`[weekly_guard] ${sym}: ${info.status}${info.lastSignal ? ` — last=${info.lastSignal}` : ""}`);
}
