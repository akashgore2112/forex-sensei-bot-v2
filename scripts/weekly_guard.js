// scripts/weekly_guard.js (ESM)
// Weekly guard: says OK if we saw any signal within N weeks,
// reading from reports/daily/.last (preferred), then _last, then newest YYYY-MM-DD.
// Flexible JSON reader: supports {latest}, arrays of signals with {entry}, etc.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------- helpers -----------------
const arg = (name, def = null) => {
  const m = process.argv.join(" ").match(new RegExp(`--${name}="?([^"\\s]+)"?`));
  return m ? m[1] : def;
};
const exists = (p) => { try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; } };
const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

const WEEKS = parseInt(arg("weeks", "12"), 10);
const SYMBOLS = (arg("symbols", "EUR-USD,GBP-USD,USD-JPY")).split(",").map(s => s.trim()).filter(Boolean);

const now = new Date();
const cutoffMs = now.getTime() - WEEKS * 7 * 24 * 3600 * 1000;

const repoRoot = path.join(__dirname, "..");
const dailyRoot = path.join(repoRoot, "reports", "daily");

// Prefer .last, then _last, then newest dated folder
function findLatestDailyDir() {
  const candidates = [".last", "_last"].map(n => path.join(dailyRoot, n));
  for (const c of candidates) if (exists(c)) return { dir: c, label: path.basename(c) };

  // fallback to newest YYYY-MM-DD
  if (!exists(dailyRoot)) return { dir: null, label: null };
  const dated = fs.readdirSync(dailyRoot).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  if (!dated.length) return { dir: null, label: null };
  const pick = path.join(dailyRoot, dated.at(-1));
  return { dir: pick, label: dated.at(-1) };
}

// pull a timestamp (ms) from various shapes
function latestSignalMs(obj) {
  const ts = [];

  // 1) direct latest
  if (obj?.latest) ts.push(new Date(obj.latest).getTime());

  // 2) arrays with {entry}
  if (Array.isArray(obj?.lastSignals))
    for (const s of obj.lastSignals) if (s?.entry) ts.push(new Date(s.entry).getTime());
  if (Array.isArray(obj?.signals))
    for (const s of obj.signals) if (s?.entry) ts.push(new Date(s.entry).getTime());
  if (Array.isArray(obj?.events))
    for (const e of obj.events) if (e?.entry) ts.push(new Date(e.entry).getTime());

  // 3) summary fields
  if (obj?.summary?.lastSignalTime) ts.push(new Date(obj.summary.lastSignalTime).getTime());
  if (obj?.lastSignal) ts.push(new Date(obj.lastSignal).getTime());

  return ts.length ? Math.max(...ts) : null;
}

// try per-symbol JSON, then digest.txt (JSON)
function latestForSymbol(baseDir, symbol) {
  const tried = [];
  const perSymbol = path.join(baseDir, `signals_${symbol}.json`);
  tried.push(perSymbol);
  if (exists(perSymbol)) {
    try {
      const o = readJSON(perSymbol);
      const t = latestSignalMs(o);
      if (t) return { t, source: perSymbol };
    } catch (e) {
      // continue
    }
  }

  const digest = path.join(baseDir, "digest.txt"); // JSON despite .txt
  tried.push(digest);
  if (exists(digest)) {
    try {
      const o = readJSON(digest);
      if (o?.latest) return { t: new Date(o.latest).getTime(), source: digest };
    } catch (e) {
      // continue
    }
  }
  return { t: null, source: tried.join(" | ") };
}

// ----------------- run -----------------
const weeklyDir = path.join(repoRoot, "reports", "weekly");
ensureDir(weeklyDir);

const { dir: baseDir, label } = findLatestDailyDir();
if (!baseDir) {
  console.error("[weekly_guard] ERROR: no daily reports found. Run daily-scan first.");
  process.exit(1);
}

const outJson = {
  date: isoDate(now),
  weeks: WEEKS,
  baseDir: baseDir.replace(repoRoot + path.sep, ""),
  baseLabel: label,
  symbols: {}
};

const lines = [];
for (const sym of SYMBOLS) {
  const { t, source } = latestForSymbol(baseDir, sym);
  let status = "BORDERLINE";
  let lastIso = null;

  if (t) {
    lastIso = new Date(t).toISOString();
    if (t >= cutoffMs) status = "OK";
  }
  outJson.symbols[sym] = { status, last: lastIso, source: source.replace(repoRoot + path.sep, "") };
  lines.push(`${sym}: ${status}${lastIso ? ` — last=${lastIso}` : ""} (src=${outJson.symbols[sym].source})`);
}

const fnBase = `weekly_${isoDate(now)}`;
fs.writeFileSync(path.join(weeklyDir, `${fnBase}.json`), JSON.stringify(outJson, null, 2));
fs.writeFileSync(path.join(weeklyDir, `${fnBase}.txt`), `${fnBase}\nweeks=${WEEKS}\nbase=${outJson.baseDir}\n\n${lines.join("\n")}\n`);

console.log("[weekly_guard] wrote:");
console.log(`  reports/weekly/${fnBase}.json`);
console.log(`  reports/weekly/${fnBase}.txt`);
for (const l of lines) console.log("[weekly_guard] " + l);
