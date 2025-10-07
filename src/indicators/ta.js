// Minimal TA set: EMA, RSI(14), ATR(14), ADX(14)

export function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (i === 0) prev = v;
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes, period = 14) {
  const out = Array(closes.length).fill(null);
  let gain = 0,
    loss = 0;

  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    gain += ch > 0 ? ch : 0;
    loss += ch < 0 ? -ch : 0;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = 100 - 100 / (1 + (avgG / (avgL || 1e-12)));

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    const rs = avgG / (avgL || 1e-12);
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

export function atr(highs, lows, closes, period = 14) {
  const tr = [null];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    const t = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr.push(t);
  }
  const out = Array(tr.length).fill(null);
  let s = 0;
  for (let i = 1; i <= period; i++) s += tr[i] || 0;
  out[period] = s / period;
  for (let i = period + 1; i < tr.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

export function adx(highs, lows, closes, period = 14) {
  const len = highs.length;
  const plusDM = Array(len).fill(0);
  const minusDM = Array(len).fill(0);
  const tr = Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    const highLow = highs[i] - lows[i];
    const highClose = Math.abs(highs[i] - closes[i - 1]);
    const lowClose = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(highLow, highClose, lowClose);
  }

  // smoothed values
  const smoothTR = Array(len).fill(null);
  const smoothPlusDM = Array(len).fill(null);
  const smoothMinusDM = Array(len).fill(null);

  let trSum = 0,
    pSum = 0,
    mSum = 0;
  for (let i = 1; i <= period; i++) {
    trSum += tr[i] || 0;
    pSum += plusDM[i] || 0;
    mSum += minusDM[i] || 0;
  }
  smoothTR[period] = trSum;
  smoothPlusDM[period] = pSum;
  smoothMinusDM[period] = mSum;

  for (let i = period + 1; i < len; i++) {
    smoothTR[i] = smoothTR[i - 1] - smoothTR[i - 1] / period + tr[i];
    smoothPlusDM[i] = smoothPlusDM[i - 1] - smoothPlusDM[i - 1] / period + plusDM[i];
    smoothMinusDM[i] = smoothMinusDM[i - 1] - smoothMinusDM[i - 1] / period + minusDM[i];
  }

  const pDI = Array(len).fill(null);
  const mDI = Array(len).fill(null);
  const dx = Array(len).fill(null);

  for (let i = period; i < len; i++) {
    const p = (100 * (smoothPlusDM[i] || 0)) / (smoothTR[i] || 1e-12);
    const m = (100 * (smoothMinusDM[i] || 0)) / (smoothTR[i] || 1e-12);
    pDI[i] = p;
    mDI[i] = m;
    dx[i] = (100 * Math.abs(p - m)) / ((p + m) || 1e-12);
  }

  // ADX = SMA of DX
  const adxOut = Array(len).fill(null);
  let sum = 0;
  for (let i = period; i < period * 2; i++) sum += dx[i] || 0;
  adxOut[period * 2 - 1] = sum / period;
  for (let i = period * 2; i < len; i++) {
    adxOut[i] = (adxOut[i - 1] * (period - 1) + (dx[i] || 0)) / period;
  }
  return adxOut;
}
