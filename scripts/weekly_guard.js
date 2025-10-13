// ESM: works with "type": "module"
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------- CLI args ----------
const argv = process.argv.slice(2).join(" ");
const symMatch = /--symbols="?([^"\n]+)"?/i.exec(argv);
const weeksMatch = /--weeks=(\d+)/i.exec(argv);

const SYMBOLS = (symMatch ? symMatch[1] : "EUR-USD,GBP-USD,USD-JPY")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const WEEKS = weeksMatch ? Math.max(1, parseInt(weeksMatch[1], 10)) : 12;

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DAILY_DIR = path.join(ROOT, "reports", "daily");
const WEEKLY_DIR = path.join(ROOT, "reports", "weekly");

// ---------- Helpers ----------
async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

async function listDailyDates() {
  let entries = [];
  try {
    entries = await fs.readdir(DAILY_DIR, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
  return entries
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map(d => d.name)
    .sort(); // oldest -> newest
}

function weekKey(dateStr) {
  // ISO-like week key: YYYY-Www (Monday-based)
  const d = new Date(dateStr + "T00:00:00Z");
  // Move to nearest Thursday to get week/year correctly
  const target = new Date(d.valueOf());
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target - firstThu;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  const year = target.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
}

async function readText(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function readJson(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// Try to pull S4 (trend OFF) winRate from scan_<SYM>.txt
function parseS4WinRateFromScan(scanTxt) {
  if (!scanTxt) return null;
  // Find the block that mentions "trend=OFF", then a line with winRate=XX.X%
  // We scan from bottom to catch the last run.
  const lines = scanTxt.split(/\r?\n/).reverse();
  let inOffBlock = false;
  for (const line of lines) {
    if (/trend\s*=\s*OFF/i.test(line)) {
      inOffBlock = true;
      continue;
    }
    if (inOffBlock) {
      const m = /winRate\s*=\s*([0-9.]+)%/i.exec(line);
      if (m) return Number(m[1]);
      // keep scanning a few more lines
    }
  }
  return null;
}

// ---------- Main roll-up ----------
async function main() {
  await ensureDir(WEEKLY_DIR);

  const allDates = await listDailyDates();
  if (allDates.length === 0) {
    console.log(`[weekly_guard] No daily reports found under ${DAILY_DIR}`);
    process.exit(0);
  }

  // Only last N weeks of dates
  // Build map { weekKey: { symbol: { days, signals, s4WinRates[] } } }
  const weeksMap = new Map();

  for (const dateStr of allDates) {
    const wk = weekKey(dateStr);
    if (!weeksMap.has(wk)) weeksMap.set(wk, new Map());

    for (const sym of SYMBOLS) {
      const scanPath = path.join(DAILY_DIR, dateStr, `scan_${sym}.txt`);
      const sigPath = path.join(DAILY_DIR, dateStr, `signals_${sym}.json`);

      const scanTxt = await readText(scanPath);
      const sigJson = await readJson(sigPath);

      if (!weeksMap.get(wk).has(sym)) {
        weeksMap.get(wk).set(sym, { days: 0, signals: 0, s4Wins: [] });
      }
      const cell = weeksMap.get(wk).get(sym);

      // count this day if we have either the scan or signals
      if (scanTxt || sigJson) cell.days += 1;

      if (Array.isArray(sigJson)) cell.signals += sigJson.length;

      const wr = parseS4WinRateFromScan(scanTxt);
      if (wr != null && !Number.isNaN(wr)) cell.s4Wins.push(wr);
    }
  }

  // Keep only last WEEKS entries
  const wkKeys = Array.from(weeksMap.keys()).sort();
  const lastKeys = wkKeys.slice(-WEEKS);

  const summary = [];
  for (const wk of lastKeys) {
    const row = { week: wk, symbols: {} };
    for (const sym of SYMBOLS) {
      const cell = weeksMap.get(wk).get(sym) || { days: 0, signals: 0, s4Wins: [] };
      const avgWR =
        cell.s4Wins.length > 0
          ? Number((cell.s4Wins.reduce((a, b) => a + b, 0) / cell.s4Wins.length).toFixed(1))
          : null;
      row.symbols[sym] = {
        days: cell.days,
        signals: cell.signals,
        s4_avg_winRate: avgWR,
      };
    }
    summary.push(row);
  }

  // Simple guard rule: last 4 weeks must have some signals AND avg S4 winRate >= 45%
  const GUARD_WEEKS = Math.min(4, summary.length);
  const GUARD_MIN_WIN = 45.0;

  const guard = { ok: true, reason: "OK" };
  for (let i = summary.length - GUARD_WEEKS; i < summary.length; i++) {
    if (i < 0) continue;
    const row = summary[i];
    for (const sym of SYMBOLS) {
      const { signals, s4_avg_winRate } = row.symbols[sym];
      if (signals <= 0) {
        guard.ok = false;
        guard.reason = `No signals for ${sym} in ${row.week}`;
      }
      if (s4_avg_winRate != null && s4_avg_winRate < GUARD_MIN_WIN) {
        guard.ok = false;
        guard.reason = `Low S4 winRate for ${sym} in ${row.week} (${s4_avg_winRate}%)`;
      }
    }
  }

  // Write outputs
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const outJson = path.join(WEEKLY_DIR, `weekly_${stamp}.json`);
  const outTxt = path.join(WEEKLY_DIR, `weekly_${stamp}.txt`);

  await fs.writeFile(outJson, JSON.stringify({ symbols: SYMBOLS, weeks: WEEKS, summary, guard }, null, 2));
  let txt = `WEEKLY GUARD (last ${WEEKS} weeks) — ${stamp}\n\n`;
  for (const row of summary) {
    txt += `Week ${row.week}\n`;
    for (const sym of SYMBOLS) {
      const c = row.symbols[sym];
      txt += `  ${sym}: days=${c.days}, signals=${c.signals}, S4_avg_winRate=${c.s4_avg_winRate ?? "n/a"}%\n`;
    }
    txt += `\n`;
  }
  txt += `Guard: ${guard.ok ? "OK" : "BORDERLINE"} — ${guard.reason}\n`;
  await fs.writeFile(outTxt, txt, "utf8");

  console.log(`[weekly_guard] wrote:\n  ${path.relative(ROOT, outJson)}\n  ${path.relative(ROOT, outTxt)}`);
  console.log(`[weekly_guard] Guard: ${guard.ok ? "OK" : "BORDERLINE"} — ${guard.reason}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
