// TwelveData adapter (Node 20+ built-in fetch). Caches handled by caller.
// Env: TWELVEDATA_API_KEY required.

import { requireEnv } from '../utils/env.js';

const BASE = 'https://api.twelvedata.com/time_series';

// Map internal TF to TwelveData interval
const TF_MAP = {
  '1D': '1day',
  '4H': '4h',
  '1H': '1h',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Simple exponential backoff
async function withRetry(fn, { tries = 5, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw lastErr;
}

/**
 * fetchCandles({ symbol, timeframe, startDate, endDate, outputsize })
 * - symbol e.g. "EUR/USD"
 * - timeframe one of 1D,4H,1H
 * - startDate/endDate: "YYYY-MM-DD"
 * Returns array of { time: ISO, open, high, low, close, volume }
 */
export async function fetchCandles({
  symbol,
  timeframe,
  startDate,
  endDate,
  outputsize = 5000,
}) {
  requireEnv(['TWELVEDATA_API_KEY']);
  const apikey = process.env.TWELVEDATA_API_KEY;
  const interval = TF_MAP[timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

  let page = 1;
  const all = [];
  let hasMore = true; // ESLint-safe loop condition

  while (hasMore) {
    const url = new URL(BASE);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('format', 'JSON');
    url.searchParams.set('order', 'ASC'); // oldest -> newest
    url.searchParams.set('outputsize', String(outputsize));
    if (startDate) url.searchParams.set('start_date', startDate);
    if (endDate) url.searchParams.set('end_date', endDate);
    url.searchParams.set('apikey', apikey);
    url.searchParams.set('page', String(page));

    const res = await withRetry(async () => {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status} ${r.statusText}: ${t}`);
      }
      return r.json();
    });

    if (res?.status === 'error') throw new Error(`TwelveData error: ${res.message || 'unknown'}`);

    const data = res?.values || res?.data || res?.candles || res?.value || [];
    if (!Array.isArray(data) || data.length === 0) {
      // no data on this page => stop
      hasMore = false;
      break;
    }

    // normalize fields
    for (const d of data) {
      all.push({
        time: new Date(d.datetime || d.date || d.time).toISOString(),
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
        volume: d.volume != null ? Number(d.volume) : null,
      });
    }

    // Determine if more pages exist
    const totalPages = Number(res?.total_pages) || Number(res?.pages) || null;
    const nextToken = res?.next_page || res?.next_page_token || null;

    if (totalPages != null) {
      hasMore = page < totalPages;
      page += 1;
    } else if (nextToken) {
      // some APIs return next page number or token
      page = Number(nextToken) || page + 1;
      hasMore = true;
    } else {
      // fallback: if we got a 'full' page, try next; otherwise stop
      hasMore = data.length >= outputsize;
      if (hasMore) page += 1;
    }

    await sleep(120); // polite delay
  }

  // de-dup & sort just in case
  const map = new Map();
  for (const c of all) map.set(c.time, c);
  return [...map.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
}
