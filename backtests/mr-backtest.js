export function backtestMR(h1, signals, opts = {}) {
  const timeoutBars = opts.timeoutBars ?? 48; // 2 days on 1H
  const results = [];
  let wins = 0, losses = 0, sumR = 0, holdHrs = 0;

  // map time → index for quick lookup
  const idxOf = new Map(h1.map((c, i) => [c.time, i]));

  for (const s of signals) {
    const i0 = idxOf.get(s.time);
    if (i0 == null) continue;
    const dir = s.direction;
    const entry = s.entry;
    const sl = s.sl;
    const tp = s.tp;

    const risk = dir === 'SELL' ? (sl - entry) : (entry - sl);
    if (!(risk > 0)) continue;

    let exit = null, outcome = 'TIMEOUT', R = 0, bars = 0;

    for (let j = i0 + 1; j < Math.min(h1.length, i0 + 1 + timeoutBars); j++) {
      const c = h1[j];
      bars = j - i0;

      if (dir === 'SELL') {
        // SL hit if high >= sl ; TP hit if low <= tp
        if (c.high >= sl) { exit = sl; outcome = 'SL'; R = -1; break; }
        if (c.low <= tp)  { exit = tp; outcome = 'TP'; R = (entry - tp) / risk; break; }
      } else {
        if (c.low <= sl)  { exit = sl; outcome = 'SL'; R = -1; break; }
        if (c.high >= tp) { exit = tp; outcome = 'TP'; R = (tp - entry) / risk; break; }
      }
    }

    if (!exit) {
      const last = h1[Math.min(h1.length - 1, i0 + timeoutBars)];
      exit = last.close;
      if (dir === 'SELL') R = (entry - exit) / risk;
      else R = (exit - entry) / risk;
    }

    if (R >= 0) wins++; else losses++;
    sumR += R; holdHrs += bars;

    results.push({ time: s.time, direction: dir, entry, exit, outcome, R, holdBars: bars });
  }

  const trades = results;
  const stats = {
    wins, losses,
    winRate: trades.length ? (wins * 100) / trades.length : 0,
    avgR: trades.length ? sumR / trades.length : 0,
    expectancy: trades.length ? sumR / trades.length : 0,
    avgHoldHrs: trades.length ? holdHrs : 0
  };

  return { trades, stats };
}
