// Rolling 4H zones timeline + trend guard (EMA20 slope + ADX avg)
import { buildZones4H } from './range-levels.js';

function ema(arr, period) {
  const k = 2 / (period + 1);
  let e = arr[0];
  for (let i = 1; i < arr.length; i++) e = k * arr[i] + (1 - k) * e;
  return e;
}

export function buildZonesTimeline(
  h4,
  { lookback = 120, clusterBps = 15, slopeBpsMax = 8, adxTrendMax = 20 } = {}
) {
  const tl = [];
  if (!Array.isArray(h4) || h4.length < lookback) return tl;

  for (let i = lookback - 1; i < h4.length; i++) {
    const win = h4.slice(i - lookback + 1, i + 1);
    const z = buildZones4H(win, { lookback: win.length, clusterBps });

    // --- Trend guard (flat-ish regime preferred for MR)
    const closes = win.map(w => w.close);
    const adxs = win.map(w => w.adx14).filter(v => v != null);
    const emaNow = ema(closes, 20);
    const emaPrev = ema(closes.slice(0, -5), 20); // ~5 bars earlier
    const slopeBps = Math.abs((emaNow - emaPrev) / emaPrev) * 10000; // in bps
    const avgAdx = adxs.length ? adxs.reduce((a, b) => a + b, 0) / adxs.length : 0;

    tl.push({
      time: h4[i].time,
      highs: z.highs,
      lows:  z.lows,
      trendOk: (slopeBps <= slopeBpsMax) && (avgAdx <= adxTrendMax)
    });
  }
  return tl;
}
