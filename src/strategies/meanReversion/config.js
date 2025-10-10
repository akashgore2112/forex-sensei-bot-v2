// src/strategies/meanReversion/config.js

export const MR_CONFIG = {
  // ---- Core MR thresholds (oscillator + regime) ----
  rsiLow: 30,
  rsiHigh: 70,

  // Trend guard (thoda conservative to avoid chasing trends)
  adxMax: 24,        // pehle 25/28 the; thoda tighten
  adxTrendMax: 26,
  slopeBpsMax: 22,

  // Price vs zone proximity
  levelTolBps: 20,   // touch window tighter (Set B se tight)

  // ---- Zone quality ----
  minTouches: 2,     // 1 -> 2 (zone quality ↑)

  // ---- Confirmation / rejection ----
  useConfirmation: true,
  requireTouch: false,       // exact pip touch not mandatory
  minRejectionBps: 1.2,      // wick vs close min
  maxBodyFrac: 0.75,         // body <= 75% range
  minWickFrac: 0.30,         // zone-side wick >= 30% range
  // optional: agar detector support karta ho:
  // confirmCloseAwayBps: 6, // retest candle close zone se ≥6 bps doodh

  // ---- Volatility guard ----
  useVolGuard: true,
  atrLookback: 20,
  maxAtrMultiple: 2.4,

  // ---- Retest entry window ----
  retestBars: 2,      // quick rejection chahiye
  retestTolBps: 10,   // retest tolerance tighter

  // ---- Risk model / exits ----
  atrSL: 2.2,         // SL wider to survive initial spike
  rr: 1.1,            // TP closer so MR hit probability ↑
  timeoutBars: 72,    // NEW: backtester yahi use karega (fallback 48)

  // ---- Debounce ----
  cooldownBars: 6,
};
