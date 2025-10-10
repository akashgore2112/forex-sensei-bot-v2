import { MR_CONFIG } from './config.js';

function bps(a, b) { return Math.abs((a - b) / b) * 10000; }

export function detectMR({ h1, zones, cfg = MR_CONFIG }) {
  const out = [];
  if (!Array.isArray(h1) || !zones) return out;

  let lastSellIdx = -9999, lastBuyIdx = -9999;

  for (let i = 50; i < h1.length; i++) { // warmup skip
    const c = h1[i];
    const { open, high, low, close, rsi14, adx14, atr14, time } = c;
    if (rsi14 == null || adx14 == null || atr14 == null) continue;

    // nearest zones
    const nh = zones.highs?.reduce((best, z) => {
      const d = bps(close, z.price);
      return d < (best?.d ?? Infinity) ? { z, d } : best;
    }, null);
    const nl = zones.lows?.reduce((best, z) => {
      const d = bps(close, z.price);
      return d < (best?.d ?? Infinity) ? { z, d } : best;
    }, null);

    // -------- SELL near range-high --------
    if (
      nh &&
      nh.d <= cfg.levelTolBps &&
      (nh.z.touches || 0) >= cfg.minTouches &&
      rsi14 >= cfg.rsiHigh &&
      adx14 < cfg.adxMax &&
      (i - lastSellIdx) >= cfg.cooldownBars &&
      (!cfg.requireTouch || high >= nh.z.price) &&
      (!cfg.useConfirmation || (
        high >= nh.z.price && close < nh.z.price &&
        bps(high, close) >= cfg.minRejectionBps   // wick rejection size
      ))
    ) {
      // Risk anchored to zone
      const sl = nh.z.price + cfg.atrSL * atr14;
      const entry = close; // signal close
      const tp = entry - cfg.rr * (sl - entry);
      out.push({
        time, direction: 'SELL', entry,
        sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
        ctx: {
          rsi: rsi14, adx: adx14,
          distBps: Number(nh.d.toFixed(2)),
          zone: Number(nh.z.price.toFixed(5)),
          touches: nh.z.touches
        }
      });
      lastSellIdx = i;
      continue; // same bar me BUY avoid
    }

    // -------- BUY near range-low --------
    if (
      nl &&
      nl.d <= cfg.levelTolBps &&
      (nl.z.touches || 0) >= cfg.minTouches &&
      rsi14 <= cfg.rsiLow &&
      adx14 < cfg.adxMax &&
      (i - lastBuyIdx) >= cfg.cooldownBars &&
      (!cfg.requireTouch || low <= nl.z.price) &&
      (!cfg.useConfirmation || (
        low <= nl.z.price && close > nl.z.price &&
        bps(close, low) >= cfg.minRejectionBps
      ))
    ) {
      const sl = nl.z.price - cfg.atrSL * atr14;
      const entry = close;
      const tp = entry + cfg.rr * (entry - sl);
      out.push({
        time, direction: 'BUY', entry,
        sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
        ctx: {
          rsi: rsi14, adx: adx14,
          distBps: Number(nl.d.toFixed(2)),
          zone: Number(nl.z.price.toFixed(5)),
          touches: nl.z.touches
        }
      });
      lastBuyIdx = i;
    }
  }
  return out;
}
