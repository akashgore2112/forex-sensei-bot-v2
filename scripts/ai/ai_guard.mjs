import fs from 'fs';
import path from 'path';

const aiDir = process.argv.find(a=>a.startsWith('--ai_dir='))?.split('=')[1] || 'reports/ai';
const weeks = Number(process.argv.find(a=>a.startsWith('--weeks='))?.split('=')[1] || 12);

function parseDate(s){ return new Date(s); }
function lastNDirs(){ // picks yyyy-mm-dd within last N*7 days
  const cut = Date.now() - (weeks*7*24*3600*1000);
  return fs.readdirSync(aiDir).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter(d=>+parseDate(d) >= cut)
    .sort();
}

const days = lastNDirs();
const acc = {};
for(const d of days){
  const p = path.join(aiDir,d);
  for(const f of fs.readdirSync(p).filter(f=>f.endsWith('.json'))){
    const o = JSON.parse(fs.readFileSync(path.join(p,f),'utf8'));
    const key = o.symbol;
    acc[key] ??= { approve:0, reject:0, caution:0, total:0, days:0 };
    acc[key].approve += o.approve; acc[key].reject += o.reject; acc[key].caution += o.caution;
    acc[key].total += o.total; acc[key].days += 1;
  }
}

console.log(`[ai/guard] window days=${days.length}`);
for(const [k,v] of Object.entries(acc)){
  const keptRatio = v.approve / (v.total||1);
  const flag = keptRatio>=0.4 ? 'OK' : 'BORDERLINE';
  console.log(`[ai/guard] ${k}: approve=${v.approve}/${v.total} kept=${(keptRatio*100).toFixed(1)}% -> ${flag}`);
}
