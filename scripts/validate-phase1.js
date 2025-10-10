// scripts/validate-phase1.js
import fs from 'node:fs';
import path from 'node:path';

const CACHE = path.join(process.cwd(), 'cache', 'json');

const FILES = [
  'EUR-USD_1D.json',
  'EUR-USD_4H.json',
  'EUR-USD_1H.json',
];

function readCandles(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(raw);
  const arr = j.candles || [];
  // schema: time is ISO string now
  return arr.map(c => ({
    ...c,
    t: new Date(c.time).getTime(),
  }));
}

function summary(name, arr) {
  const ok = arr.length > 0;
  const first = ok ? new Date(arr[0].t).toISOString() : 'NA';
  const last  = ok ? new Date(arr[arr.length - 1].t).toISOString() : 'NA';
  return { name, count: arr.length, first, last };
}

function expectedCounts(firstISO, lastISO) {
  const start = new Date(firstISO);
  const end   = new Date(lastISO);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end <= start) {
    return null; // cannot judge
  }
  // include both endpoints → add 1 day
  const days = Math.floor((end - start) / (24 * 3600 * 1000)) + 1;

  return {
    d1: { exp: days,          tol: Math.max(20, Math.round(days * 0.08)) },  // ±8% (min ±20 bars)
    h4: { exp: days * 6,      tol: Math.max(120, Math.round(days * 6 * 0.08)) },
    h1: { exp: days * 24,     tol: Math.max(400, Math.round(days * 24 * 0.08)) },
  };
}

function checkRange(label, count, exp, tol) {
  const min = exp - tol;
  const max = exp + tol;
  const pass = count >= min && count <= max;
  return { label, count, exp, tol, min, max, pass };
}

(function main() {
  const data = FILES.map(f => {
    const p = path.join(CACHE, f);
    const arr = readCandles(p);
    return { file: f, arr, ...summary(f, arr) };
  });

  // Print quick header
  console.log('Phase-1 validate');
  data.forEach(d => {
    console.log(` • ${d.file}: count=${d.count}, first=${d.first}, last=${d.last}`);
  });

  // Build expectations from 1H (widest span), fall back to 1D if needed
  const ref = data.find(d => d.file.includes('_1H')) || data.find(d => d.file.includes('_1D'));
  if (!ref || ref.count === 0) {
    throw new Error('No data to validate.');
  }
  const ex = expectedCounts(ref.first, ref.last);
  if (!ex) {
    throw new Error('Bad timespan (cannot compute expectations).');
  }

  // Map files → tf label
  const results = data.map(d => {
    const tf = d.file.includes('_1D') ? 'd1'
           : d.file.includes('_4H') ? 'h4'
           : 'h1';
    const x = ex[tf];
    return checkRange(tf.toUpperCase(), d.count, x.exp, x.tol);
  });

  const failed = results.filter(r => !r.pass);
  if (failed.length) {
    console.log('\nCount out of expected range:');
    failed.forEach(r => {
      console.log(`  ${r.label}: got ${r.count}, expected ${r.exp} ± ${r.tol} (range ${r.min}..${r.max})`);
    });
    process.exit(1);
  }

  console.log('\n✅ Phase-1 validate OK');
})();
