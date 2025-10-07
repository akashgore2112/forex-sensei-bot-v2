// TwelveData adapter (Node 20+ built-in fetch) — chunked range fetch for intraday.
// Env: TWELVEDATA_API_KEY

import { requireEnv } from '../utils/env.js';

const BASE = 'https://api.twelvedata.com/time_series';
const TF_MAP = { '1D': '1day', '4H': '4h', '1H': '1h' };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetry(fn, { tries = 5, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await sleep(baseMs * 2 ** i); }
  }
  throw lastErr;
}

function fmt(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

/**
 * fetchPage — ek page ya ek date-window pull karta hai
 */
async function fetchPage({ symbol, interval, startDate, endDate, outputsize, apikey, page }) {
  const url = new URL(BASE);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('order', 'ASC');
  if (outputsize) url.searchParams.set('outputsize', String(outputsize));
  if (startDate) url.searchParams.set('start_date', startDate);
  if (endDate)   url.searchParams.set('end_date', endDate);
  if (page)      url.searchParams.set('page', String(page));
  url.searchParams.set('apikey', apikey);

  const res = await withRetry(async () => {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}: ${await r.text()}`);
    return r.json();
  });

  if (res?.status === 'error') throw new Error(`TwelveData error: ${res.message || 'unknown'}`);

  const data = Array.isArray(res?.values) ? res.values
              : Array.isArray(res?.data) ? res.data
              : Array.isArray(res?.candles) ? res.candles
              : Array.isArray(res?.value) ? res.value
              : [];

  const norm = data.map((d) => ({
    time: new Date(d.datetime || d.date || d.time).toISOString(),
    open: Number(d.open),
    high: Number(d.high),
    low : Number(d.low),
    close: Number(d.close),
    volume: d.volume != null ? Number(d.volume) : null,
  }));

  // paging hints
  const totalPages = Number(res?.total_pages) || Number(res?.pages) || null;
  const nextToken  = res?.next_page || res?.next_page_token || null;

  return { rows: norm, totalPages, nextToken };
}

/**
 * fetchCandles — high-level: agar intraday hai to date-chunk loop, warna simple.
 * startDate/endDate: "YYYY-MM-DD"
 */
export async function fetchCandles({ symbol, timeframe, startDate, endDate, outputsize = 5000 }) {
  requireEnv(['TWELVEDATA_API_KEY']);
  const apikey = process.env.TWELVEDATA_API_KEY;
  const interval = TF_MAP[timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

  const all = [];

  // chunk size per TF (UTC days)
  const chunkDays = timeframe === '1H' ? 90 : timeframe === '4H' ? 180 : 3650; // 1D ko ek hi shot

  // date windows
  let curStart = new Date(startDate);
  const hardEnd = new Date(endDate);

  while (curStart <= hardEnd) {
    const curEnd = addDays(curStart, chunkDays - 1);
    const s = fmt(curStart);
    const e = fmt(curEnd <= hardEnd ? curEnd : hardEnd);

    // try paging inside this window (kuch accounts me paging chalta hai)
    let page = 1;
    let keepPaging = true;
    while (keepPaging) {
      const { rows, totalPages, nextToken } = await fetchPage({
        symbol, interval, startDate: s, endDate: e, outputsize, apikey, page
      });
      if (rows.length) all.push(...rows);

      if (totalPages != null) {
        keepPaging = page < totalPages; page += 1;
      } else if (nextToken) {
        page = Number(nextToken) || page + 1; keepPaging = true;
      } else {
        // fallback: if page is "full", maybe more data; else stop
        keepPaging = rows.length >= outputsize;
        if (keepPaging) page += 1;
      }
      await sleep(120);
    }

    // next chunk
    curStart = addDays(curEnd, 1);
    await sleep(120);
  }

  // de-dup + sort
  const map = new Map();
  for (const c of all) map.set(c.time, c);
  return [...map.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
}
