import { MR_CONFIG } from './config.js';

// basis points distance helper
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

// advance zones timeline pointer up to current candle time
function advanceZoneIndex(tl, tISO, idx) {
  const n = tl.length;
  while (idx + 1 < n && tl[idx + 1].time <= tISO) idx++;
  return idx;
}

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

// pin-rejection checks (used when confirmation is ON)
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

/**
 * Retest-first MR detector
 */
export function detectMR({ h1, zonesTimeline, cfg = MR_CONFIG, ignoreTrend = false }) {
  const out = [];
  if (!Array.isArray(h1) || !Array.isArray(zonesTimeline) || zonesTimeline.length === 0) return out;

  const confirmCloseBps = cfg.confirmCloseAwayBps ?? 6;
  const useZoneTrend = cfg.useZoneTrend ?? true;  // NEW

  let zIdx = 0;
  let lastSellIdx = -999, lastBuyIdx = -999;
  const pending = []; // {dir, zPrice, created, expires, atrAtSignal}

  for (let i = 50; i < h1.length; i++) {
    const c = h1[i];
    const { time, high, low, close, open, rsi14, adx14, atr14 } = c;
    if (rsi14 == null || adx14 == null || atr14 == null) continue;

    // --- Volatility guard ---
    if (cfg.useVolGuard && i >= cfg.atrLookback) {
      const avgATR = mean(h1.slice(i - cfg.atrLookback, i).map(x => x.atr14 || 0));
      if (avgATR && atr14 > cfg.maxAtrMultiple * avgATR) {
        continue; // too hot — skip both setup & retest consumption
      }
    }

    // sync zones pointer
    zIdx = advanceZoneIndex(zonesTimeline, time, zIdx);
    const Z = zonesTimeline[zIdx];
    if (!Z) continue;

    // ---------- 1) Setup create ----------
    const zoneGateOK = ignoreTrend || !useZoneTrend || Z.trendOk === true;
    if (zoneGateOK) {
      const nh = nearest(Z.highs, close);
      const nl = nearest(Z.lows, close);

      // SELL setup
      const sellSetup =
        nh && nh.d <= cfg.levelTolBps &&
        (nh.z.touches || 0) >= cfg.minTouches &&
        rsi14 >= cfg.rsiHigh && adx14 < cfg.adxMax &&
        (i - lastSellIdx) >= cfg.cooldownBars &&
        (!cfg.useConfirmation || (
          pinRejectHigh(c, cfg) &&
          (!cfg.requireTouch || high >= nh.z.price) &&
          bps(high, close) >= cfg.minRejectionBps &&
          bps(close, nh.z.price) >= confirmCloseBps
        ));
      if (sellSetup) {
        pending.push({
          dir: 'SELL', zPrice: nh.z.price, created: i, expires: i + cfg.retestBars, atrAtSignal: atr14,
        });
      }

      // BUY setup
      const buySetup =
        nl && nl.d <= cfg.levelTolBps &&
        (nl.z.touches || 0) >= cfg.minTouches &&
        rsi14 <= cfg.rsiLow && adx14 < cfg.adxMax &&
        (i - lastBuyIdx) >= cfg.cooldownBars &&
        (!cfg.useConfirmation || (
          pinRejectLow(c, cfg) &&
          (!cfg.requireTouch || low <= nl.z.price) &&
          bps(close, low) >= cfg.minRejectionBps &&
          bps(close, nl.z.price) >= confirmCloseBps
        ));
      if (buySetup) {
        pending.push({
          dir: 'BUY', zPrice: nl.z.price, created: i, expires: i + cfg.retestBars, atrAtSignal: atr14,
        });
      }
    }

    // ---------- 2) Retest consume (ENTRY) ----------
    for (let k = pending.length - 1; k >= 0; k--) {
      const p = pending[k];
      if (i > p.expires) { pending.splice(k, 1); continue; }

      // If user still wants to respect zone trend at retest
      if (!ignoreTrend && useZoneTrend && !Z.trendOk) continue;

      // ADX must still be calm at the entry bar
      if (adx14 >= cfg.adxMax) continue;

      if (p.dir === 'SELL') {
        const retestOK =
          high >= p.zPrice && bps(high, p.zPrice) <= cfg.retestTolBps && close < p.zPrice;
        if (retestOK) {
          const sl = p.zPrice + cfg.atrSL * atr14;
          const entry = close;
          const tp = entry - cfg.rr * (sl - entry);
          out.push({ time, direction: 'SELL', entry,
            sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
            ctx: { z: Number(p.zPrice.toFixed(5)), retest: true } });
          lastSellIdx = i; pending.splice(k, 1);
        }
      } else {
        const retestOK =
          low <= p.zPrice && bps(p.zPrice, low) <= cfg.retestTolBps && close > p.zPrice;
        if (retestOK) {
          const sl = p.zPrice - cfg.atrSL * atr14;
          const entry = close;
          const tp = entry + cfg.rr * (entry - sl);
          out.push({ time, direction: 'BUY', entry,
            sl: Number(sl.toFixed(5)), tp: Number(tp.toFixed(5)),
            ctx: { z: Number(p.zPrice.toFixed(5)), retest: true } });
          lastBuyIdx = i; pending.splice(k, 1);
        }
      }
    }
  }
  return out;
}
