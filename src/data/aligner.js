// Align 1D/4H/1H series to clean UTC boundaries, drop duplicates, detect gaps.

function floorToTf(date, tf) {
  const d = new Date(date);
  if (tf === '1D') {
    d.setUTCHours(0, 0, 0, 0);
  } else if (tf === '4H') {
    const h = d.getUTCHours();
    d.setUTCHours(h - (h % 4), 0, 0, 0);
  } else if (tf === '1H') {
    d.setUTCMinutes(0, 0, 0);
  } else {
    throw new Error('Unsupported tf: ' + tf);
  }
  return d;
}

export function alignSeries(raw, tf) {
  // normalize
  const m = new Map();
  for (const c of raw) {
    const t = floorToTf(c.time, tf).toISOString();
    // if multiple ticks fall into same bucket, keep the last (close-to-close bars)
    m.set(t, {
      time: t,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: c.volume != null ? Number(c.volume) : null,
    });
  }
  const arr = [...m.values()].sort((a, b) => new Date(a.time) - new Date(b.time));

  // build gap info
  const stepMs = tf === '1D' ? 86400000 : tf === '4H' ? 14400000 : 3600000;
  const gaps = [];
  for (let i = 1; i < arr.length; i++) {
    const prev = new Date(arr[i - 1].time).getTime();
    const cur = new Date(arr[i].time).getTime();
    const miss = (cur - prev) / stepMs - 1;
    if (miss > 0) gaps.push({ after: arr[i - 1].time, missingBars: miss });
  }
  return { candles: arr, gaps };
}
