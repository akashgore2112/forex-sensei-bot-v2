import { MR_CONFIG } from './config.js';

function bps(a, b) { return Math.abs((a - b) / b) * 10000; }
function nearest(levels, px) {
  if (!levels || !levels.length) return null;
  let best = null;
  for (const z of levels) {
    const d = bps(px, z.price);
    if (!best || d < best.d) best = { z, d };
  }
  return best;
}
function advanceZoneIndex(tl, tISO, idx) {
  const n = tl.length;
  while (idx + 1 < n && tl[idx + 1].time <= tISO) idx++;
  return idx;
}
function mean(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

function pinRejectHigh(c, cfg) {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  return (body <= cfg.maxBodyFrac * range) &&
         (upperWick >= cfg.minWickFrac * range);
}
function pinRejectLow(c, cfg) {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return (body <= cfg.maxBodyFrac * range) &&
         (lowerWick >= cfg.minWickFrac * range);
}

export function detectMR({ h1, zonesTimeline, cfg = MR_CONFIG, ignoreTrend = false }) {
  const out = [];
  if (!Array.isArray(h1) || !Array.isArray(zonesTimeline) || zonesTimeline.length === 0) return out;

  let zIdx = 0, lastSellIdx = -999, lastBuyIdx = -999;

  for (let i = 50; i < h1.length; i++) {
    const c = h1[i];
    const { time, high, low, close, open, rsi14, adx14, atr14 } = c;
    if (rsi14 == null || adx14 == null || atr14 == null) continue;

    // Volatility guard
    if (cfg.useVolGuard && i >= cfg.atrLookback) {
      const avgATR = mean(h1.slice(i - cfg.atrLookback, i).map(x => x.atr14 || 0));
      if (avgATR && atr14 > cfg.maxAtrMultiple * avgATR) continue;
    }

    zIdx = advanceZoneIndex(zonesTimeline, time, zIdx);
    const Z = zonesTimeline[zIdx];
    if (!Z) continue;
    if (!ignoreTrend && !Z.trendOk) continue;

    const nh = nearest(Z.highs, close);
    const nl = nearest(Z.lows, close);

    // SELL near high
    if (
      nh && nh.d <= cfg.levelTolBps && (nh.z.touches || 0) >= cfg.minTouches &&
      rsi14 >= cfg.rsiHigh && adx14 < cfg.adxMax &&
      (i - lastSellIdx) >= cfg.cooldownBars &&
      (!cfg.requireTouch || high >= nh.z.price) &&
      (!cfg.useConfirmation || (
        high >= nh.z.price && close < nh.z.price &&
        bps(high, close) >= cfg.minRejectionBps &&
        pinRejectHigh(c, cfg)
      ))
    ) {
      const sl = nh.z.price + cfg.atrSL * atr14;
      const entry = close; const tp = entry - cfg.rr * (sl - entry);
      out.push({
        time, direction:'SELL', entry,
        sl:Number(sl.toFixed(5)), tp:Number(tp.toFixed(5)),
        ctx:{ rsi:rsi14, adx:adx14, distBps:Number(nh.d.toFixed(2)), zone:Number(nh.z.price.toFixed(5)), touches:nh.z.touches }
      });
      lastSellIdx = i; continue;
    }

    // BUY near low
    if (
      nl && nl.d <= cfg.levelTolBps && (nl.z.touches || 0) >= cfg.minTouches &&
      rsi14 <= cfg.rsiLow && adx14 < cfg.adxMax &&
      (i - lastBuyIdx) >= cfg.cooldownBars &&
      (!cfg.requireTouch || low <= nl.z.price) &&
      (!cfg.useConfirmation || (
        low <= nl.z.price && close > nl.z.price &&
        bps(close, low) >= cfg.minRejectionBps &&
        pinRejectLow(c, cfg)
      ))
    ) {
      const sl = nl.z.price - cfg.atrSL * atr14;
      const entry = close; const tp = entry + cfg.rr * (entry - sl);
      out.push({
        time, direction:'BUY', entry,
        sl:Number(sl.toFixed(5)), tp:Number(tp.toFixed(5)),
        ctx:{ rsi:rsi14, adx:adx14, distBps:Number(nl.d.toFixed(2)), zone:Number(nl.z.price.toFixed(5)), touches:nl.z.touches }
      });
      lastBuyIdx = i;
    }
  }
  return out;
}
