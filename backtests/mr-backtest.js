// Simple one-at-a-time SL/TP backtester for MR signals on 1H candles.
// Inputs:  h1 candles (array), signals [{time,direction,entry,sl,tp,ctx}]
// Output:  { trades:[...], stats:{wins,losses,winRate,avgR,expectancy,avgHoldHrs} }

function isoToIndex(h1, iso) {
  const t = new Date(iso).toISOString();
  // binary search could be faster; linear ok for now
  for (let i = 0; i < h1.length; i++) if (h1[i].time >= t) return i;
  return h1.length - 1;
}

export function backtestMR(h1, signals, { maxBars = 200 } = {}) {
  const trades = [];
  let i = 0; // candle pointer
  for (const sig of signals) {
    const startIdx = Math.max(isoToIndex(h1, sig.time) + 1, i); // next bar after signal
    if (startIdx >= h1.length) break;

    const isBuy = sig.direction === 'BUY';
    const risk = isBuy ? (sig.entry - sig.sl) : (sig.sl - sig.entry);
    if (!(risk > 0)) continue;

    let exit, exitIdx = null, outcome = null; // "TP" | "SL"
    const endIdx = Math.min(h1.length - 1, startIdx + maxBars);

    for (let k = startIdx; k <= endIdx; k++) {
      const c = h1[k];
      // Conservative: if both touched in same bar -> count SL
      if (isBuy) {
        const hitSL = c.low <= sig.sl;
        const hitTP = c.high >= sig.tp;
        if (hitSL && hitTP) { outcome = "SL"; exit = sig.sl; exitIdx = k; break; }
        if (hitTP) { outcome = "TP"; exit = sig.tp; exitIdx = k; break; }
        if (hitSL) { outcome = "SL"; exit = sig.sl; exitIdx = k; break; }
      } else {
        const hitSL = c.high >= sig.sl;
        const hitTP = c.low  <= sig.tp;
        if (hitSL && hitTP) { outcome = "SL"; exit = sig.sl; exitIdx = k; break; }
        if (hitTP) { outcome = "TP"; exit = sig.tp; exitIdx = k; break; }
        if (hitSL) { outcome = "SL"; exit = sig.sl; exitIdx = k; break; }
      }
    }

    if (!outcome) { // maxBars timeout -> treat as exit at close
      outcome = "TIMEOUT";
      const c = h1[endIdx];
      exit = c.close;
      exitIdx = endIdx;
    }

    const R = isBuy ? (exit - sig.entry) / risk : (sig.entry - exit) / risk;
    trades.push({
      time: sig.time, direction: sig.direction, entry: sig.entry,
      sl: sig.sl, tp: sig.tp, exit, outcome, R,
      holdBars: Math.max(1, exitIdx - startIdx + 1),
    });

    // one-at-a-time: move pointer so overlap na ho
    i = exitIdx + 1;
  }

  // stats
  const wins = trades.filter(t => t.outcome === "TP").length;
  const losses = trades.filter(t => t.outcome === "SL").length;
  const n = trades.length || 1;
  const winRate = (wins / n) * 100;
  const avgR = trades.reduce((s,t)=>s+t.R,0) / n;
  const expectancy = (wins/n)*1 - (losses/n)*1; // in "R" units if TP=+1R, SL=-1R approx
  const avgHoldHrs = (trades.reduce((s,t)=>s+t.holdBars,0) / n) || 0;

  return { trades, stats: { wins, losses, total:n, winRate, avgR, expectancy, avgHoldHrs } };
}
