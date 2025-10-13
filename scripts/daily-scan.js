// scripts/daily-scan.js
// Daily MR scan -> JSON signals + digest, with de-dup per symbol
// Usage: SYMBOLS="EUR-USD,GBP-USD" FROM_DAYS=365 node scripts/daily-scan.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SYMBOLS = (process.env.SYMBOLS || 'EUR-USD,GBP-USD,USD-JPY')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const TODAY = new Date();
const toStr = TODAY.toISOString().slice(0, 10);
const fromDays = Number(process.env.FROM_DAYS || 365);
const fromDate = new Date(TODAY.getTime() - fromDays * 86400000);
const fromStr = fromDate.toISOString().slice(0, 10);

const outDir = path.join('reports', 'daily', toStr);
const lastDir = path.join('reports', 'daily', '.last');

ensureDir(outDir);
ensureDir(lastDir);

const digest = [];
digest.push(`# Daily MR scan ${toStr}`);
digest.push(`Window: ${fromStr} .. ${toStr}`);
digest.push('');

for (const sym of SYMBOLS) {
  const res = runScan(sym, fromStr, toStr);
  const scanTxt = res.stdout;
  const scanFile = path.join(outDir, `scan_${sym}.txt`);
  fs.writeFileSync(scanFile, scanTxt);

  const signals = extractSignals(scanTxt);
  const lastPath = path.join(lastDir, `${sym}.json`);
  const prev = readJson(lastPath, { lastTs: null });
  const newestTs = signals[0]?.time || null;
  const isNew = newestTs && newestTs !== prev.lastTs;

  // Write signal JSON (always)
  const sigFile = path.join(outDir, `signals_${sym}.json`);
  writeJson(sigFile, {
    symbol: sym,
    from: fromStr,
    to: toStr,
    totalDetected: signals.length,
    newest: signals[0] || null,
    signals,
  });

  // Update de-dup marker only if new
  if (isNew) {
    writeJson(lastPath, { lastTs: newestTs });
  }

  // Digest line
  if (!signals.length) {
    digest.push(`${sym}: no signals`);
  } else if (isNew) {
    digest.push(`${sym}: NEW ${signals.length ? '✔' : ''} latest=${newestTs} side=${signals[0].side} entry=${signals[0].entry}`);
  } else {
    digest.push(`${sym}: no new (latest already emitted: ${prev.lastTs || 'n/a'})`);
  }
}

fs.writeFileSync(path.join(outDir, 'digest.txt'), digest.join('\n') + '\n');
console.log(digest.join('\n'));

function runScan(symbol, from, to) {
  // Reuse existing CLI
  const args = ['scripts/scan-mr.js', `--symbol=${symbol}`, `--from=${from}`, `--to=${to}`, '--debug=1'];
  const out = spawnSync('node', args, { encoding: 'utf8' });
  if (out.error) throw out.error;
  return { stdout: out.stdout || '', stderr: out.stderr || '' };
}

function extractSignals(text) {
  // Parse lines that look like ISO-date + side + entry/exit/TP/SL
  const lines = text.split(/\r?\n/);
  const isoStart = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z/;
  const arr = [];
  for (const ln of lines) {
    if (!isoStart.test(ln)) continue;
    if (!/\b(BUY|SELL)\b/.test(ln)) continue;
    if (!/\bentry[=:]/.test(ln)) continue;

    const time = (ln.match(isoStart) || [null])[0];
    const side = (ln.match(/\b(BUY|SELL)\b/) || [null, null])[1];
    const entry = num(matchAny(ln, /entry[:=]([\d.]+)/));
    const exit = num(matchAny(ln, /exit[:=]([\d.]+)/));
    const tp = num(matchAny(ln, /TP[:=]([\d.]+)/i));
    const sl = num(matchAny(ln, /SL[:=]([\d.]+)/i));
    arr.push({ time, side, entry, exit, tp, sl, raw: ln.trim() });
  }
  // newest first (lines usually chronological, but ensure)
  arr.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return arr;
}

function matchAny(str, re) {
  const m = str.match(re);
  return m ? m[1] : null;
}
function num(x) { return x ? Number(x) : null; }

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return def; }
}
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
