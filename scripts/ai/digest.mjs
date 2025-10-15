import fs from 'fs';
import path from 'path';

const dir = process.argv[2]?.split('=')[1] || 'reports/ai/.last';
const out = process.argv[3]?.split('=')[1] || `reports/ai/preview.txt`;

function read(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }

const files = fs.readdirSync(dir).filter(f=>f.endsWith('.json') && f!=='digest.txt');
const lines = ['# AI Digest'];
for(const f of files){
  const o = read(path.join(dir,f));
  lines.push(`${o.symbol}: APPROVE ${o.approve} | CAUTION ${o.caution} | REJECT ${o.reject} | total ${o.total}`);
}
fs.writeFileSync(out, lines.join('\n')+'\n');
console.log(`[ai/digest] wrote ${out}`);
