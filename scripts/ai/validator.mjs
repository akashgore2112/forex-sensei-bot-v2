// ESM, Node v20
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }
function arg(key, def=null){
  const i = process.argv.findIndex(a=>a===key || a.startsWith(key+'='));
  if(i<0) return def;
  const a = process.argv[i];
  if(a.includes('=')) return a.split('=').slice(1).join('=');
  return process.argv[i+1] ?? def;
}
function symOut(sym){ return sym.toUpperCase().replace(/\//g,'-'); }

const cfgPath = path.join(root, 'config', 'ai.json');
const cfg = fs.existsSync(cfgPath) ? readJSON(cfgPath) : { score_threshold:60, features:{} };

const IN = path.resolve(root, arg('--in','reports/daily/.last'));
const OUT = path.resolve(root, arg('--out', `reports/ai/${new Date().toISOString().slice(0,10)}`));
const MODE = arg('--mode', process.env.OPENAI_API_KEY ? 'llm':'heuristic'); // default auto
const THRESH = Number(arg('--threshold', cfg.score_threshold));
const SYMBOLS = (arg('--symbols','')||'').split(',').map(s=>s.trim()).filter(Boolean);

// ---- helpers (best-effort feature extraction from your signals_*.json shape)
function loadSignals(sym){
  const base = symOut(sym);
  const tried = [
    path.join(IN, `signals_${base}.json`),
    path.join(IN, `signals_${base.replace('-','')}.json`),
  ];
  for(const p of tried){
    if(fs.existsSync(p)) return readJSON(p);
  }
  return { signals: [] };
}
function hour(z){ try{ return new Date(z).getUTCHours(); }catch{ return null; } }
function sessionOK(ts){
  const h = hour(ts);
  if(h==null) return 0;
  // rough London/NY overlap 06–20 UTC
  return (h>=6 && h<=20) ? 1 : 0;
}
function num(v, def=null){ const n = Number(v); return Number.isFinite(n)?n:def; }

function heuristicScore(sig){
  // generic, defensive parsing
  const ctx = sig?.ctx || {};
  const f = cfg.features || {};
  let score = 0;
  const reasons = [];

  // retest quality
  if(ctx.retest){ score += (f.retest_quality ?? 10); reasons.push('retest_ok'); }
  else { reasons.push('retest_missing'); }

  // session
  if(sessionOK(sig?.time || sig?.ts)){ score += (f.session_ok ?? 8); reasons.push('session_ok'); }
  else { reasons.push('off_session'); }

  // simple trend align proxy (if any flag present)
  const trendOn = (sig?.trendOn ?? sig?.trend_on ?? sig?.trend) ? 1 : 0;
  if(trendOn){ score += (f.htf_trend_align ?? 10); reasons.push('trend_align'); }

  // zone/structure proxies
  if(ctx?.zone?.touches>=2 || ctx?.rejections>=2){ score += (f.zone_quality ?? 10); reasons.push('zone_quality'); }

  // adr headroom proxy (tpDistance/atr) if present
  const tpDist = num(sig?.tpDistance);
  const atr = num(sig?.atr);
  if(tpDist!=null && atr!=null && atr>0){
    const headroom = tpDist/atr;
    if(headroom >= (cfg.min_adr_headroom_pct ?? 0.35)){ score += (f.adr_headroom ?? 10); reasons.push('adr_headroom_ok'); }
    else reasons.push('low_headroom');
  }

  // spread/atr proxy if present
  const spr = num(sig?.spread);
  if(spr!=null && atr!=null && atr>0){
    const rat = spr/atr;
    if(rat <= (cfg.max_spread_to_atr ?? 0.12)){ score += (f.spread_atr_ok ?? 8); reasons.push('spread_ok'); }
    else reasons.push('high_spread');
  }

  // structure_confluence best-effort
  if((ctx?.emaAlign ?? ctx?.ema_align) === 'ok'){ score += (f.structure_confluence ?? 10); reasons.push('ema_confluence'); }

  let validation = 'CAUTION';
  if(score >= THRESH) validation = 'APPROVE';
  else if(score < THRESH*0.6) validation = 'REJECT';

  return { score, validation, reasons };
}

async function llmScore(sym, sig){
  const sys = `You are a strict trading setup validator. Output valid JSON only. Schema:
{"validation":"APPROVE|REJECT|CAUTION","aiConfidence":0-100,"rationale":["..."]}`;
  const user = {
    pair: symOut(sym),
    when: sig?.time || sig?.ts,
    side: sig?.side || sig?.dir,
    context: sig?.ctx || {},
    snapshot: {
      ema20_50: sig?.ema20_50,
      adx: sig?.adx, rsi: sig?.rsi, atr: sig?.atr
    },
    plan: { entry: sig?.entry, sl: sig?.sl, tp: sig?.tp, rr: sig?.rr },
    instructions: "Score 0-100. Approve if strong confluence, reject on conflicts/volatility. JSON only."
  };
  const prompt = [
    { role:'system', content: sys },
    { role:'user', content: JSON.stringify(user) }
  ];

  // Minimal client using fetch (Node 20 has global fetch)
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: "json_object" },
      messages: prompt,
      temperature: 0.2
    })
  });
  const data = await resp.json();
  let parsed;
  try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  // guard
  const conf = num(parsed.aiConfidence, 0);
  let validation = parsed.validation || 'CAUTION';
  if(conf < (cfg.llm_threshold ?? 70)) validation = 'CAUTION';
  return { score: conf, validation, reasons: parsed.rationale || [] };
}

async function main(){
  if(!SYMBOLS.length){
    console.error('[ai/validator] --symbols required (comma-separated)');
    process.exit(2);
  }
  ensureDir(OUT);

  const summary = [];
  for(const s of SYMBOLS){
    const set = loadSignals(s);
    const items = Array.isArray(set) ? set : (set.signals || []);
    const outItems = [];
    let A=0,R=0,C=0;

    for(const sig of items){
      let res;
      if(MODE==='llm' && process.env.OPENAI_API_KEY){
        try { res = await llmScore(s, sig); }
        catch(e){ res = heuristicScore(sig); res.reasons.push('llm_fallback'); }
      } else {
        res = heuristicScore(sig);
      }
      if(res.validation==='APPROVE') A++; else if(res.validation==='REJECT') R++; else C++;

      outItems.push({
        time: sig?.time || sig?.ts,
        side: sig?.side || sig?.dir,
        entry: sig?.entry, sl: sig?.sl, tp: sig?.tp,
        score: res.score, decision: res.validation, reasons: res.reasons, ctx: sig?.ctx || {}
      });
    }

    const fout = path.join(OUT, `${symOut(s)}.json`);
    fs.writeFileSync(fout, JSON.stringify({ symbol: symOut(s), total: outItems.length, approve:A, reject:R, caution:C, items: outItems }, null, 2));
    console.log(`[ai/validator] ${symOut(s)} total=${outItems.length} -> APPROVE:${A} REJECT:${R} CAUTION:${C}`);
    summary.push({ symbol: symOut(s), total: outItems.length, approve:A, reject:R, caution:C });
  }

  // digest
  const digest = ['# AI Validator Summary', ...summary.map(r=>`${r.symbol}: A${r.approve}/R${r.reject}/C${r.caution}/${r.total}`)].join('\n');
  fs.writeFileSync(path.join(OUT, `digest.txt`), digest+'\n');

  // maintain .last
  const lastDir = path.join(root, 'reports/ai/.last');
  ensureDir(lastDir);
  for(const s of SYMBOLS){
    const base = `${symOut(s)}.json`;
    fs.copyFileSync(path.join(OUT, base), path.join(lastDir, base));
  }
  fs.copyFileSync(path.join(OUT, 'digest.txt'), path.join(lastDir, 'digest.txt'));
}

main().catch(e=>{ console.error(e); process.exit(1); });
