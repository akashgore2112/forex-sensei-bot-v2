// TwelveData adapter (Node 20+). Backward chunking + graceful "no data" handling.
// Env: TWELVEDATA_API_KEY; optional: LOOKBACK_DAYS (default 365).

import { requireEnv } from '../utils/env.js';

const BASE = 'https://api.twelvedata.com/time_series';
const TF_MAP = { '1D': '1day', '4H': '4h', '1H': '1h' };

const SLEEP_MS = 120;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function withRetry(fn, { tries = 5, baseMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; await sleep(baseMs * 2 ** i); }
  }
  throw lastErr;
}

function fmt(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

async function fetchPage({ symbol, interval, s, e, apikey, page, outputsize }) {
  const url = new URL(BASE);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('order', 'ASC');
  url.searchParams.set('apikey', apikey);
  if (s) url.searchParams.set('start_date', s);
  if (e) url.searchParams.set('end_date', e);
  if (page) url.searchParams.set('page', String(page));
  if (outputsize) url.searchParams.set('outputsize', String(outputsize));

  const res = await withRetry(async () => {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const t = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}: ${t}`);
    try { return JSON.parse(t); } catch { return {}; }
  });

  if (res?.status === 'error') {
    // normalize common “no data” case into empty rows (don’t crash whole loop)
    if ((res.message || '').toLowerCase().includes('no data')) {
      return { rows: [], totalPages: 1, nextToken: null };
    }
    throw new Error(`TwelveData error: ${res.message || 'unknown'}`);
  }

  const raw = Array.isArray(res?.values) ? res.values
            : Array.isArray(res?.data) ? res.data
            : Array.isArray(res?.candles) ? res.candles
            : Array.isArray(res?.value) ? res.value
            : [];

  const rows = raw.map((d) => ({
    time: new Date(d.datetime || d.date || d.time).toISOString(),
    open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close),
    volume: d.volume != null ? Number(d.volume) : null,
  }));

  const totalPages = Number(res?.total_pages) || Number(res?.pages) || null;
  const nextToken  = res?.next_page || res?.next_page_token || null;
  return { rows, totalPages, nextToken };
}

/**
 * fetchCandles({symbol,timeframe,startDate,endDate,outputsize})
 * If start/end not provided, uses LOOKBACK_DAYS (default 365) ending today.
 * For intraday (4H/1H), fetches in **backward chunks** (recent → older) and stops
 * when provider starts returning no-data for older windows.
 */
export async function fetchCandles({
  symbol, timeframe, startDate, endDate, outputsize = 5000,
}) {
  requireEnv(['TWELVEDATA_API_KEY']);
  const apikey = process.env.TWELVEDATA_API_KEY;
  const interval = TF_MAP[timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

  // default lookback if dates not provided
  const lookbackDays = Number(process.env.LOOKBACK_DAYS || 365);
  const hardEnd = endDate ? new Date(endDate) : new Date();
  const hardStart = startDate ? new Date(startDate) : addDays(hardEnd, -lookbackDays);

  const all = [];
  // chunk size by TF (days)
  const chunkDays = timeframe === '1H' ? 60 : timeframe === '4H' ? 120 : 3650;

  // Walk backward from end → start, so latest data guaranteed even if older chunks empty.
  let curEnd = hardEnd;
  while (curEnd >= hardStart) {
    const curStart = addDays(curEnd, -chunkDays + 1);
    const s = fmt(curStart < hardStart ? hardStart : curStart);
    const e = fmt(curEnd);

    let page = 1, keep = true, gotAny = false;
    while (keep) {
      const { rows, totalPages, nextToken } = await fetchPage({
        symbol, interval, s, e, apikey, page, outputsize,
      });
      if (rows.length) { all.push(...rows); gotAny = true; }

      if (totalPages != null) { keep = page < totalPages; page += 1; }
      else if (nextToken) { page = Number(nextToken) || page + 1; keep = true; }
      else { keep = rows.length >= outputsize; if (keep) page += 1; }

      await sleep(SLEEP_MS);
    }

    // If this chunk returned nothing, assume older windows won't either → stop.
    if (!gotAny && (timeframe === '1H' || timeframe === '4H')) break;

    // move to older window
    curEnd = addDays(curStart, -1);
    await sleep(SLEEP_MS);
  }

  // de-dup + sort
  const map = new Map();
  for (const c of all) map.set(c.time, c);
  return [...map.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
}
