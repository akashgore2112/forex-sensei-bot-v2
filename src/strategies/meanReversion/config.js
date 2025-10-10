// src/strategies/meanReversion/config.js
export const MR_CONFIG = {
  // Core MR thresholds (balanced)
  useZoneTrend: false,        // ⬅️ turn OFF the zone trend gate
  rsiLow: 34,
  rsiHigh: 66,
  adxMax: 25,
  levelTolBps: 24,          // zone se ~0.22% tak “near”

  // Zone quality (retest entry model me touches ko zyada tight na rakho)
  minTouches: 1,

  // Candle confirmation (soft)
  useConfirmation: true,
  requireTouch: false,
  minRejectionBps: 10,       // 0.10% wick advantage
  maxBodyFrac: 0.75,         // body <= 75% of range
  minWickFrac: 0.35,         // zone-side wick >= 30%

  // Volatility guard
  useVolGuard: true,
  atrLookback: 20,
  maxAtrMultiple: 2.2,       // thoda tighter vs earlier 2.4

  // Retest entry (NEW core)
  retestBars: 6,            // “C-set”: retest window ≈ 1 day (H1 data)
  retestTolBps: 14,          // zone proximity test
  confirmCloseAwayBps: 6,    // NEW: retest ke baad close zone se itna “door” hona chahiye

  // Risk model
  atrSL: 2.4,
  rr: 1.0,
  slBufferBps: 3,            // small SL buffer to avoid micro-stop

  // Debounce
  cooldownBars: 6,

  // Trend guard (relaxed)
  slopeBpsMax: 25,
  adxTrendMax: 28,

  // Backtest/engine control
  timeoutBars: 60            // NEW: trade ko max 48 bars (≈2D) me close karao
};
