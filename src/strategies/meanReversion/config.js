export const MR_CONFIG = {
  // Mean Reversion filters
  rsiLow: 25,
  rsiHigh: 75,
  adxMax: 20,
  levelTolBps: 16,     // 0.16% (thoda soft)

  // Zone quality
  minTouches: 1,       // earlier 2, ab 1 to open up

  // Confirmation (wick rejection around zone)
  useConfirmation: true,
  minRejectionBps: 2,  // 0.02% wick vs close
  requireTouch: true,

  // Risk model
  atrSL: 1.5,
  rr: 1.5,

  // Debounce
  cooldownBars: 6,

  // Trend guard (used by zones-timeline)
  slopeBpsMax: 8,      // EMA20 slope <= 8 bps over ~5 bars
  adxTrendMax: 20      // 4H regime ADX average cap
};
