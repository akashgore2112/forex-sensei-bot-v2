// Build rolling zone timeline from 4H candles.
// For each 4H bar (after warmup), compute zones from the last `lookback` bars.
import { buildZones4H } from './range-levels.js';

export function buildZonesTimeline(h4, { lookback = 120, clusterBps = 15 } = {}) {
  const tl = [];
  if (!Array.isArray(h4) || h4.length < lookback) return tl;

  for (let i = lookback - 1; i < h4.length; i++) {
    const win = h4.slice(i - lookback + 1, i + 1);
    const z = buildZones4H(win, { lookback: win.length, clusterBps });
    tl.push({
      time: h4[i].time, // 4H bar time (ISO)
      highs: z.highs,   // [{price,touches}...]
      lows: z.lows
    });
  }
  return tl;
}
