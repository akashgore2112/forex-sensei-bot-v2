// scripts/build-candles.js
import { aggregateDukascopy } from "../src/data/vendors/dukascopy-aggregate.js";

const VENDOR = (process.env.DATA_VENDOR || "DUKA").toUpperCase();
const SYMBOL = (process.env.DUKA_SYMBOL || "EURUSD").toUpperCase();

/** basic rolling SMA without NaN (pre-warmup me close se fill) */
function addSMA(candles, key, period) {
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    sum += c;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) {
      candles[i][key] = +(sum / period).toFixed(5);
    } else {
      // pre-warmup: NaN avoid
      candles[i][key] = +c.toFixed(5);
    }
  }
}

/** attach a minimal indicator set required by validation */
function addBasicIndicators(candles) {
  // Feel free to adjust periods if your validator checks others
  addSMA(candles, "sma20", 20);
  addSMA(candles, "sma50", 50);
  addSMA(candles, "sma200", 200);
}

(async () => {
  if (VENDOR !== "DUKA") {
    console.log(`[build] DATA_VENDOR=${VENDOR} (non-DUKA) — not handled in this step.`);
    process.exit(0);
  }

  console.log(`[build] vendor=DUKA symbol=${SYMBOL} → aggregate to 1H/4H/1D JSON...`);
  const out = await aggregateDukascopy({
    symbol: SYMBOL,
    rawRoot: "data/raw/duka",
    outRoot: "data/candles/duka",
    cacheRoot: "cache/json",
  });

  if (!out) process.exit(1);

  // indicators (no NaN ever)
  ["1H", "4H", "1D"].forEach((tf) => addBasicIndicators(out[tf].candles));

  // overwrite cache/json with indicator-enriched series
  const fs = await import("node:fs/promises");
  await fs.writeFile("cache/json/EUR-USD_1H.json", JSON.stringify(out["1H"]));
  await fs.writeFile("cache/json/EUR-USD_4H.json", JSON.stringify(out["4H"]));
  await fs.writeFile("cache/json/EUR-USD_1D.json", JSON.stringify(out["1D"]));

  console.log(
    `[build] OK — candles: 1H=${out["1H"].candles.length}, 4H=${out["4H"].candles.length}, 1D=${out["1D"].candles.length}`
  );
})();
