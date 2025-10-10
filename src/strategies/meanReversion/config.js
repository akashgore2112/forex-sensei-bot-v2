export const MR_CONFIG = {
  // --- Mean Reversion core (loosened) ---
  rsiLow: 30,
  rsiHigh: 70,
  adxMax: 25,          // 22 -> 25
  levelTolBps: 22,     // 18 -> 22 (0.22%)
  minTouches: 1,       // 2 -> 1  (open up)

  // --- Confirmation (softer; keep quality but not too strict) ---
  useConfirmation: false,
  requireTouch: false,  // was true; wick must not "must-touch" exact level now
  minRejectionBps: 1.2, // 2 -> 1.2
  maxBodyFrac: 0.75,    // 0.6 -> 0.75
  minWickFrac: 0.30,    // 0.4 -> 0.30

  // --- Volatility guard (relax) ---
  useVolGuard: true,
  atrLookback: 20,
  maxAtrMultiple: 2.4,  // 1.8 -> 2.4

  // --- Risk model (a tad wider SL; modest RR) ---
  atrSL: 1.8,
  rr: 1.3,

  // --- Debounce ---
  cooldownBars: 6,      // 8 -> 6

  // --- Trend guard (already fine; keep relaxed) ---
  slopeBpsMax: 25,
  adxTrendMax: 28
};
