// Build 4H range zones (high/low) with simple clustering.
// Output: { highs: [{price,touches}], lows: [{price,touches}] }

export function buildZones4H(candles, { lookback = 120, clusterBps = 15 } = {}) {
  if (!Array.isArray(candles) || candles.length < 10) return { highs: [], lows: [] };

  const end = candles.length - 1;
  const start = Math.max(0, end - lookback + 1);
  const slice = candles.slice(start, end + 1);

  const highs = [];
  const lows = [];
  for (let i = 2; i < slice.length - 2; i++) {
    const p2 = slice[i - 2], p1 = slice[i - 1], c = slice[i], n1 = slice[i + 1], n2 = slice[i + 2];
    const isHigh = c.high > p1.high && c.high > p2.high && c.high > n1.high && c.high > n2.high;
    const isLow  = c.low  < p1.low  && c.low  < p2.low  && c.low  < n1.low  && c.low  < n2.low;
    if (isHigh) highs.push(c.high);
    if (isLow)  lows.push(c.low);
  }

  function cluster(levels) {
    if (!levels.length) return [];
    const sorted = levels.slice().sort((a, b) => a - b);
    const out = [];
    const tol = (px) => (clusterBps / 10000) * px; // bps → %
    let cur = { price: sorted[0], touches: 1 };
    for (let i = 1; i < sorted.length; i++) {
      const px = sorted[i];
      if (Math.abs(px - cur.price) <= tol(cur.price)) {
        cur.price = (cur.price * cur.touches + px) / (cur.touches + 1);
        cur.touches += 1;
      } else {
        out.push(cur);
        cur = { price: px, touches: 1 };
      }
    }
    out.push(cur);
    out.sort((a, b) => b.touches - a.touches);
    return out;
  }

  return { highs: cluster(highs), lows: cluster(lows) };
}
