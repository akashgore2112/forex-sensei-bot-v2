// scripts/daily-scan.js  (ESM version)
// Run:  SYMBOLS='GBP-USD,USD-JPY' FROM_DAYS=400 node scripts/daily-scan.js

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- inputs ----
const SYMBOLS = (process.env.SYMBOLS || 'EUR-USD,GBP-USD,USD-JPY')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const FROM_DAYS = Number(process.env.FROM_DAYS || 400);

// date window
const now = new Date();
const to = now.toISOString().slice(0, 10);
const from = new Date(now.getTime() - FROM_DAYS * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

// logging
const logDir = path.resolve(__dirname, '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `daily_${to}.txt`);

function logAppend(s) {
  fs.appendFileSync(logFile, s);
}

function runNode(scriptRel, args) {
  const scriptAbs = path.join(__dirname, scriptRel);
  const cmdArgs = [scriptAbs, ...args];
  const res = spawnSync(process.execPath, cmdArgs, { encoding: 'utf-8' });
  const out = res.stdout || '';
  const err = res.stderr || '';
  logAppend(`\n$ node ${scriptRel} ${args.join(' ')}\n${out}${err ? `\n[stderr]\n${err}` : ''}\n`);
  if (res.status !== 0) {
    console.error(`✖ ${scriptRel} failed (exit ${res.status}). See ${logFile}`);
    process.exit(res.status);
  }
  return out;
}

// header
const header = `[daily-scan] ${new Date().toISOString()}
symbols=${SYMBOLS.join(', ')}  window=${from}..${to}
------------------------------------------------------------
`;
fs.writeFileSync(logFile, header);
console.log(header.trim());

for (const sym of SYMBOLS) {
  console.log(`\n— ${sym}: S2 scan`);
  runNode('scan-mr.js', [`--symbol=${sym}`, `--from=${from}`, `--to=${to}`, '--debug=1']);

  console.log(`— ${sym}: S3 backtest (trend ON)`);
  runNode('backtest-mr.js', [`--symbol=${sym}`, `--from=${from}`, `--to=${to}`]);

  console.log(`— ${sym}: S4 backtest (trend OFF)`);
  runNode('backtest-mr.js', [`--symbol=${sym}`, `--from=${from}`, `--to=${to}`, '--no-trend=1']);
}

console.log(`\n[daily-scan] done → ${logFile}`);
