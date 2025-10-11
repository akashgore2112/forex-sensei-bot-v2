// src/strategies/meanReversion/config.js
export const MR_CONFIG = {
  // --- Core MR thresholds ---
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 25,              // local noise guard
  levelTolBps: 24,         // distance to zone to call "near" (0.26%)

  // --- Zone quality (we let retest do the filtering) ---
  minTouches: 1,

  // --- Candle confirmation (kept conservative) ---
  useConfirmation: true,
  requireTouch: false,     // exact touch not mandatory if retest is good
  minRejectionBps: 1.3,     // 12 bps wick vs close on the zone side
  maxBodyFrac: 0.78,       // body <= 75% of candle range
  minWickFrac: 0.30,       // zone-side wick >= 35% of range (tightened)

  // --- Retest entry (works well in your runs) ---
  retestBars: 6,           // lookahead bars after pinbar
  retestTolBps: 12,        // retest must come within 20 bps of zone
  confirmCloseAwayBps: 5,  // close should step away by ≥3 bps post-retest

  // --- Risk model ---
  atrSL: 1.8,
  rr: 1.0,                 // simple R:R for robustness

  // --- Timeout ---
  timeoutBars: 72,         // exit if neither SL/TP within 60 H bars

  // --- Cooldown / de-dup ---
  cooldownBars: 6,

  // --- Trend guard (explicitly OFF; your results are better) ---
  useTrendGuard: false,    // <- primary switch used by scripts
  useZoneTrend: true,     // <- alias for clarity (not required by scripts)
  // If you ever enable it, these are the thresholds it would use:
  slopeBpsMax: 28,
  adxTrendMax: 32,
};
