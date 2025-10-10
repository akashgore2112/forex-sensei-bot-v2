export const MR_CONFIG = {
  // --- Core MR thresholds ---
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 25,

  // Zone proximity (bps = 0.01%)
  levelTolBps: 28,        // was 24/26 → slightly wider so more candidates

  // Zone quality
  minTouches: 1,          // retest-entry itself ensures quality

  // Confirmation (still useful, but relaxed)
  useConfirmation: true,
  requireTouch: false,
  minRejectionBps: 1.2,   // wick vs close min
  maxBodyFrac: 0.75,
  minWickFrac: 0.30,

  // Volatility guard
  useVolGuard: true,
  atrLookback: 20,
  maxAtrMultiple: 2.4,

  // Retest entry window (main count booster)
  retestBars: 24,         // was 6/7 → H1 me retest 10–24 bars common
  retestTolBps: 28,       // was 20 → thoda wide so valid retests capture
  confirmCloseAwayBps: 2, // was 3 → thoda soft (close slightly away from zone)

  // Risk model
  atrSL: 1.8,
  rr: 1.0,                // near TP to reduce timeouts

  // Debounce between consecutive entries near a zone
  cooldownBars: 6,

  // Trend guard (keep realistic)
  slopeBpsMax: 25,
  adxTrendMax: 28,

  // Backtest-only
  timeoutBars: 96,        // was 60 → H1 me 4 trading days approx (timeouts kam)
};
