#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const getArg = (k, d=null) => {
  const a = argv.find(x => x.startsWith(`--${k}=`));
  return a ? a.split('=')[1] : d;
};

let symbols = getArg('symbols', process.env.SYMBOLS || 'GBP-USD,USD-JPY');
const from   = getArg('from',  '2025-09-01');
const to     = getArg('to',    '2025-10-08');
const debug  = getArg('debug', '1');

symbols = symbols.split(',').map(s => s.trim()).filter(Boolean);

mkdirSync('logs', { recursive: true });
const stamp = new Date().toISOString().slice(0,10);
const logPath = join('logs', `daily_${stamp}.txt`);
const chunks = [];

const runOne = (sym) => new Promise((res, rej) => {
  const p = spawn('node', ['scripts/scan-mr.js', `--symbol=${sym}`, `--from=${from}`, `--to=${to}`, `--debug=${debug}`],
                  { stdio: ['ignore','pipe','pipe'] });
  p.stdout.on('data', d => chunks.push(`[${sym}] ${d}`));
  p.stderr.on('data', d => chunks.push(`[${sym}][err] ${d}`));
  p.on('close', c => c === 0 ? res() : rej(new Error(`${sym} scan exited ${c}`)));
});

(async () => {
  for (const s of symbols) await runOne(s);
  writeFileSync(logPath, Buffer.concat(chunks.map(b => Buffer.from(b))));
  console.log(`wrote ${logPath}`);
})().catch(e => { console.error(e); process.exit(1); });
