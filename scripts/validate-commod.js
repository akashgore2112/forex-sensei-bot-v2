import fs from "node:fs";
import path from "node:path";
import "../src/utils/env.js";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, "cache", "json-commod");
const SYMS = (process.env.INSTRUMENTS_COMMOD || "").split(",").map(s => s.trim()).filter(Boolean);

function peek(p){
  const j = JSON.parse(fs.readFileSync(p,"utf8"));
  const first = j.candles[0]?.time;
  const last  = j.candles.at(-1)?.time;
  return { n:j.candles.length, first, last };
}

console.log("Phase-1 (commod) validate");
for (const s of SYMS) {
  const H1 = peek(path.join(CACHE, `${s.toUpperCase()}_1H.json`));
  const H4 = peek(path.join(CACHE, `${s.toUpperCase()}_4H.json`));
  const D1 = peek(path.join(CACHE, `${s.toUpperCase()}_1D.json`));
  console.log(` • ${s.toUpperCase()}_1D.json: count=${D1.n}, first=${D1.first}, last=${D1.last}`);
  console.log(` • ${s.toUpperCase()}_4H.json: count=${H4.n}, first=${H4.first}, last=${H4.last}`);
  console.log(` • ${s.toUpperCase()}_1H.json: count=${H1.n}, first=${H1.first}, last=${H1.last}`);
}
console.log("✓ Phase-1 (commod) validate OK");
