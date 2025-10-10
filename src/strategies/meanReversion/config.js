export const MR_CONFIG = {
  // Core MR thresholds
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 25,
  levelTolBps: 24,     // distance from zone to consider "near" (0.22%)

  // Zone quality
  minTouches: 1,       // open a bit; retest-entry itself is quality

  // Confirmation (still useful, but retest does the heavy lifting)
  useConfirmation: true,
  requireTouch: false,   // exact touch not mandatory
  minRejectionBps: 1.2,  // wick vs close min
  maxBodyFrac: 0.75,     // candle body <= 75% range
  minWickFrac: 0.30,     // zone-side wick >= 30% range

  // Volatility guard
  useVolGuard: true,
  atrLookback: 20,
  maxAtrMultiple: 2.4,

  // NEW — Retest entry
  retestBars: 3,        // pinbar ke baad max kitne bars tak retest consider
  retestTolBps: 14,     // zone ke itne bps ke andar wick/close aaye to enter

  // Risk model
  atrSL: 1.8,
  rr: 1.3,

  // Debounce
  cooldownBars: 6,

  // Trend guard (relaxed)
  slopeBpsMax: 25,
  adxTrendMax: 28,
};
