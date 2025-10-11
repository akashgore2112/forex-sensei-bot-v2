// src/strategies/meanReversion/config.js
export const MR_CONFIG = {
  // --- Core MR thresholds ---
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 25,              // local noise guard
  levelTolBps: 26,         // distance to zone to call "near" (0.26%)

  // --- Zone quality (we let retest do the filtering) ---
  minTouches: 1,

  // --- Candle confirmation (kept conservative) ---
  useConfirmation: true,
  requireTouch: false,     // exact touch not mandatory if retest is good
  minRejectionBps: 12,     // 12 bps wick vs close on the zone side
  maxBodyFrac: 0.75,       // body <= 75% of candle range
  minWickFrac: 0.35,       // zone-side wick >= 35% of range (tightened)

  // --- Retest entry (works well in your runs) ---
  retestBars: 9,           // lookahead bars after pinbar
  retestTolBps: 24,        // retest must come within 20 bps of zone
  confirmCloseAwayBps: 3,  // close should step away by ≥3 bps post-retest

  // --- Risk model ---
  atrSL: 1.8,
  rr: 1.0,                 // simple R:R for robustness

  // --- Timeout ---
  timeoutBars: 60,         // exit if neither SL/TP within 60 H bars

  // --- Cooldown / de-dup ---
  cooldownBars: 6,

  // --- Trend guard (explicitly OFF; your results are better) ---
  useTrendGuard: false,    // <- primary switch used by scripts
  useZoneTrend: false,     // <- alias for clarity (not required by scripts)
  // If you ever enable it, these are the thresholds it would use:
  slopeBpsMax: 25,
  adxTrendMax: 28,
};
