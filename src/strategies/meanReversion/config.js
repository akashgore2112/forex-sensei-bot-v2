export const MR_CONFIG = {
  // Mean Reversion filters
  rsiLow: 20,
  rsiHigh: 80,
  adxMax: 18,
  levelTolBps: 12,     // 0.12%: zone ke bilkul paas

  // Zone quality
  minTouches: 2,       // zone par kam se kam 2 touches

  // Confirmation rules (wick rejection)
  useConfirmation: true,
  minRejectionBps: 3,  // 0.03%: wick aur close me min gap  (SELL: (high-close)/zone, BUY: (close-low)/zone)
  requireTouch: true,  // candle ne zone ko touch kiya ho (SELL: high >= zone, BUY: low <= zone)

  // Risk model
  atrSL: 1.5,          // SL = zone ± 1.5*ATR(14)
  rr: 1.5,             // TP = SL distance * rr

  // Debounce (same side repeated signals avoid)
  cooldownBars: 6
};
