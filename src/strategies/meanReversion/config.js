export const MR_CONFIG = {
  // Mean Reversion thresholds (softer so signals open up)
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 22,
  levelTolBps: 18,      // 0.18%

  // Zone quality
  minTouches: 2,        // 2 touches -> better S/R

  // Rejection confirmation (pin-bar style)
  useConfirmation: true,
  minRejectionBps: 2,   // 0.02% wick vs close
  requireTouch: true,
  maxBodyFrac: 0.6,     // body <= 60% of range
  minWickFrac: 0.4,     // zone-side wick >= 40% of range

  // Volatility guard
  useVolGuard: true,
  atrLookback: 20,      // local avg ATR window
  maxAtrMultiple: 1.8,  // atr14 <= 1.8 * avgATR20

  // Risk model
  atrSL: 1.8,           // thoda wide to avoid noise SL
  rr: 1.3,              // conservative RR

  // Debounce
  cooldownBars: 8,

  // Trend guard (RELAXED so 30–60% bars pass)
  slopeBpsMax: 25,      // EMA20 slope tolerance
  adxTrendMax: 28
};
