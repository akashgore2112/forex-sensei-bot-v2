// scripts/build_symbols_live.mjs
// Run: node scripts/build_symbols_live.mjs --csv=reports/acceptance/s3b_pairs.csv --out=config/symbols_live.json
import fs from 'node:fs';

function arg(name, def) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const csvPath = arg('csv', 'reports/acceptance/s3b_pairs.csv');
const outPath = arg('out', 'config/symbols_live.json');

const text = fs.readFileSync(csvPath, 'utf8').trim();
const rows = text.split(/\r?\n/).slice(1).map(line => {
  const [group,symbol,,winPct,monthly,decision] = line.split(',');
  return { group, symbol, winPct:Number(winPct||0), monthly:Number(monthly||0), decision:(decision||'').trim().toUpperCase() };
});

const fx_keep = rows.filter(r=>r.group==='fx' && r.decision==='KEEP').map(r=>r.symbol);
const fx_hold = rows.filter(r=>r.group==='fx' && r.decision==='HOLD').map(r=>r.symbol);
const fx_drop = rows.filter(r=>r.group==='fx' && r.decision==='DROP').map(r=>r.symbol);
const oil_keep = rows.filter(r=>r.group==='commodity' && r.decision==='KEEP').map(r=>r.symbol);

const cfg = { fx_keep, fx_hold, fx_drop, oil_keep };
fs.mkdirSync('config', { recursive:true });
fs.writeFileSync(outPath, JSON.stringify(cfg, null, 2));
console.log('[live] wrote', outPath);
