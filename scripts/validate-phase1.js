# FILE: scripts/validate-phase1.js
# PURPOSE: validate first/last/count for every built JSON under cache/json/
#          Works for FX & commodities. Also supports SYMBOL_ENV for single symbol.

import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/env.js';

const ROOT      = path.join(process.cwd());
const CACHE_DIR = path.join(ROOT, 'cache', 'json');

function listJson(){
  if(!fs.existsSync(CACHE_DIR)) return [];
  return fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(CACHE_DIR, f));
}

function checkOne(fp){
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const arr = j.candles || [];
  const first = arr[0]?.time ?? 'NaN';
  const last  = arr.at(-1)?.time ?? 'NaN';
  const count = arr.length;

  // loose ranges (2y-ish). Commodities and FX both fit in these.
  const ranges = {
    '1D':  [500,  9000],   // allow wide; commodities may have holidays
    '4H':  [3000, 30000],
    '1H':  [12000,120000],
  };

  const tf = (j.timeframe || '').toUpperCase();
  const [min,max] = ranges[tf] || [1, Infinity];

  const okCount = count >= min && count <= max;
  const okEnds  = (first !== 'NaN' && last !== 'NaN');

  return { fp, symbol:j.symbol, tf, count, first, last, ok: okCount && okEnds };
}

function main(){
  const only = (process.env.SYMBOL_ENV || '').trim().toUpperCase();
  const files = listJson().filter(fp => (only ? path.basename(fp).startsWith(only) : true));

  console.log('Phase-1 validate');
  let bad = 0;
  for(const fp of files.sort()){
    const r = checkOne(fp);
    const line = ` • ${path.basename(fp)}: count=${r.count}, first=${r.first}, last=${r.last}`;
    if(r.ok){ console.log(line); }
    else { console.log(line, '  ← CHECK'); bad++; }
  }
  if(bad===0) console.log('✅ Phase-1 validate OK');
  else { console.log(`❌ ${bad} file(s) need attention`); process.exit(1); }
}

main();
