export const MR_CONFIG = {
  // Mean Reversion filters
  rsiLow: 20,
  rsiHigh: 80,
  adxMax: 18,
  levelTolBps: 12,     // 0.12%

  // Zone quality
  minTouches: 2,

  // Confirmation (wick rejection around zone)
  useConfirmation: true,
  minRejectionBps: 3,  // 0.03% wick vs close gap
  requireTouch: true,  // candle actually touches zone

  // Risk model
  atrSL: 1.5,
  rr: 1.5,

  // Debounce
  cooldownBars: 6
};
