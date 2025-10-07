// scripts/build-candles.js
import { aggregateDukascopy } from "../src/data/vendors/dukascopy-aggregate.js";

const VENDOR = (process.env.DATA_VENDOR || "DUKA").toUpperCase();
const SYMBOL = (process.env.DUKA_SYMBOL || "EURUSD").toUpperCase();

(async () => {
  if (VENDOR !== "DUKA") {
    console.log(`[build] DATA_VENDOR=${VENDOR} (non-DUKA) — not handled in this step.`);
    process.exit(0);
  }
  console.log(`[build] vendor=DUKA symbol=${SYMBOL} → aggregate to 1H/4H/1D JSON...`);
  await aggregateDukascopy({
    symbol: SYMBOL,
    rawRoot: "data/raw/duka",
    outRoot: "data/candles/duka",
    cacheRoot: "cache/json",
  });
  console.log("[build] OK");
})();
