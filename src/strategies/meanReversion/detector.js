import { MR_CONFIG } from './config.js';

const bps = (a, b) => Math.abs((a - b) / b) * 10000;
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
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function pinRejectHigh(c, cfg) {
  const range = c.high - c.low; if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  return body <= cfg.maxBodyFrac * range && upperWick >= cfg.minWickFrac * range;
}
function pinRejectLow(c, cfg) {
  const range = c.high - c.low; if (range <= 0) return false;
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  return body <= cfg.maxBodyFrac * range && lowerWick >= cfg.minWickFrac * range;
}

export function detectMR({ h1, zonesTimeline, cfg = MR_CONFIG, ignoreTrend = false }) {
  const out = [];
  if (!Array.isArray(h1) || !Array.isArray(zonesTimeline) || zonesTimeline.length === 0) return out;

  let zIdx = 0, lastSellIdx = -999, lastBuyIdx = -999;
  const pending = []; // {dir, zPrice, created, expires, atrAtSignal}

  for (let i = 50; i < h1.length; i++) {
    const c = h1[i];
    const { time, high, low, close, open, rsi14, adx14, atr14 } = c;
    if (rsi14 == null || adx14 == null || atr14 == null) continue;

    // Volatility guard
    if (cfg.useVolGuard && i >= cfg.atrLookback) {
      const avgATR = mean(h1.slice(i - cfg.atrLookback, i).map(x => x.atr14 || 0));
      if (avgATR && atr14 > cfg.maxAtrMultiple * avgATR) { /* skip both setup & retest */ }
      else {
        // continue with setups below
      }
    }

    // Sync zones timeline
    zIdx = advanceZoneIndex(zonesTimeline, time, zIdx);
    const Z = zonesTimeline[zIdx];
    if (!Z) continue;
    if (!ignoreTrend && !Z.trendOk) {
      // even if trend fails, we still check pending expiry below
    }

    // ---------- 1) Generate pin-bar SETUP (no entry yet) ----------
    if (ignoreTrend || Z.trendOk) {
      const nh = nearest(Z.highs, close);
      const nl = nearest(Z.lows, close);

      // SELL setup near high
      const sellSetup =
        nh && nh.d <= cfg.levelTolBps && (nh.z.touches || 0) >= cfg.minTouches &&
        rsi14 >= cfg.rsiHigh && adx14 < cfg.adxMax &&
        (i - lastSellIdx) >= cfg.cooldownBars &&
        (!cfg.useConfirmation || (
          pinRejectHigh(c, cfg) &&
          (!cfg.requireTouch || high >= nh.z.price) &&
          bps(high, close) >= cfg.minRejectionBps
        ));

      if (sellSetup) {
        pending.push({
          dir: 'SELL',
          zPrice: nh.z.price,
          created: i,
          expires: i + cfg.retestBars,
          atrAtSignal: atr14,
        });
        // do not set lastSellIdx yet; only when we actually enter
      }

      // BUY setup near low
      const buySetup =
        nl && nl.d <= cfg.levelTolBps && (nl.z.touches || 0) >= cfg.minTouches &&
        rsi14 <= cfg.rsiLow && adx14 < cfg.adxMax &&
        (i - lastBuyIdx) >= cfg.cooldownBars &&
        (!cfg.useConfirmation || (
          pinRejectLow(c, cfg) &&
          (!cfg.requireTouch || low <= nl.z.price) &&
          bps(close, low) >= cfg.minRejectionBps
        ));

      if (buySetup) {
        pending.push({
          dir: 'BUY',
          zPrice: nl.z.price,
          created: i,
          expires: i + cfg.retestBars,
          atrAtSignal: atr14,
        });
      }
    }

    // ---------- 2) Consume RETEST (actual entry) ----------
    for (let k = pending.length - 1; k >= 0; k--) {
      const p = pending[k];
      if (i > p.expires) { pending.splice(k, 1); continue; }
      if (!ignoreTrend && !Z.trendOk) continue; // retest only if trend ok now

      if (p.dir === 'SELL') {
        const retestOK =
          high >= p.zPrice && bps(high, p.zPrice) <= cfg.retestTolBps && close < p.zPrice;
        if (retestOK) {
          const sl = p.zPrice + cfg.atrSL * atr14;
          const entry = close; const tp = entry - cfg.rr * (sl - entry);
          out.push({
            time, direction:'SELL', entry,
            sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
            ctx: { z: Number(p.zPrice.toFixed(5)), retest: true }
          });
          lastSellIdx = i; pending.splice(k, 1);
        }
      } else { // BUY
        const retestOK =
          low <= p.zPrice && bps(p.zPrice, low) <= cfg.retestTolBps && close > p.zPrice;
        if (retestOK) {
          const sl = p.zPrice - cfg.atrSL * atr14;
          const entry = close; const tp = entry + cfg.rr * (entry - sl);
          out.push({
            time, direction:'BUY', entry,
            sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
            ctx: { z: Number(p.zPrice.toFixed(5)), retest: true }
          });
          lastBuyIdx = i; pending.splice(k, 1);
        }
      }
    }
  }
  return out;
}
