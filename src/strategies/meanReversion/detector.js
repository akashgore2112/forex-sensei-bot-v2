import { MR_CONFIG } from './config.js';

// dist in basis points
function distBps(price, level) {
  return Math.abs((price - level) / level) * 10000;
}

export function detectMR({ h1, zones, cfg = MR_CONFIG }) {
  const out = [];
  if (!h1?.length || !zones) return out;

  for (let i = 50; i < h1.length; i++) { // warmup skip
    const c = h1[i];
    const adx = c.adx14, rsi = c.rsi14, atr = c.atr14, close = c.close;
    if (adx == null || rsi == null || atr == null) continue;

    // nearest high/low zone
    const nearHigh = zones.highs?.reduce((best, z) => {
      const d = distBps(close, z.price);
      return d < (best?.d ?? Infinity) ? { z, d } : best;
    }, null);
    const nearLow = zones.lows?.reduce((best, z) => {
      const d = distBps(close, z.price);
      return d < (best?.d ?? Infinity) ? { z, d } : best;
    }, null);

    // SELL near high
    if (nearHigh && nearHigh.d <= cfg.levelTolBps && rsi >= cfg.rsiHigh && adx < cfg.adxMax) {
      const sl = nearHigh.z.price + cfg.atrSL * atr;
      const entry = close;
      const tp = entry - cfg.rr * (sl - entry);
      out.push({
        time: c.time, direction: 'SELL', entry,
        sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
        ctx: { rsi, adx, distBps: Number(nearHigh.d.toFixed(2)), zone: Number(nearHigh.z.price.toFixed(5)), touches: nearHigh.z.touches }
      });
    }

    // BUY near low
    if (nearLow && nearLow.d <= cfg.levelTolBps && rsi <= cfg.rsiLow && adx < cfg.adxMax) {
      const sl = nearLow.z.price - cfg.atrSL * atr;
      const entry = close;
      const tp = entry + cfg.rr * (entry - sl);
      out.push({
        time: c.time, direction: 'BUY', entry,
        sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
        ctx: { rsi, adx, distBps: Number(nearLow.d.toFixed(2)), zone: Number(nearLow.z.price.toFixed(5)), touches: nearLow.z.touches }
      });
    }
  }
  return out;
}
