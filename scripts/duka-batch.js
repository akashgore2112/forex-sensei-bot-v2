// scripts/duka-batch.js
// Run Dukascopy download + build (+ optional validate) for many symbols.
// Usage examples:
//   SYMS="EURUSD GBPUSD USDJPY" DUKA_FROM_MONTH=2023-01 DUKA_TO_MONTH=2025-10 node scripts/duka-batch.js
//   SYMS="EURUSD,GBPUSD" node scripts/duka-batch.js --validate

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import '../src/utils/env.js'; // load .env if present

const argv = new Set(process.argv.slice(2));
const DO_VALIDATE = argv.has('--validate') || argv.has('-v');

function parseSyms() {
  const raw = process.env.SYMS || 'EURUSD';
  // allow space or comma separated lists
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function runNode(scriptRelPath, extraEnv = {}) {
  const scriptPath = path.join(process.cwd(), scriptRelPath);
  execFileSync('node', [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
}

(async function main() {
  const syms = parseSyms();
  const fromM = process.env.DUKA_FROM_MONTH || '2023-01';
  const toM = process.env.DUKA_TO_MONTH || '2025-10';
  const tf = process.env.DUKA_TIMEFRAME || 'm1';

  console.log('\n== Batch start ==');
  console.log('SYMS        :', syms.join(', '));
  console.log('FROM..TO    :', fromM, '→', toM);
  console.log('TIMEFRAME   :', tf);
  console.log('Validate?   :', DO_VALIDATE ? 'yes' : 'no');

  for (const sym of syms) {
    console.log(`\n--- ${sym} :: DOWNLOAD ---`);
    runNode('scripts/duka-download.js', {
      INSTRUMENT: sym,
      DUKA_FROM_MONTH: fromM,
      DUKA_TO_MONTH: toM,
      DUKA_TIMEFRAME: tf,
    });

    console.log(`\n--- ${sym} :: BUILD ---`);
    runNode('scripts/build-candles.js', {
      INSTRUMENT: sym,
    });

    if (DO_VALIDATE) {
      console.log(`\n--- ${sym} :: VALIDATE ---`);
      runNode('scripts/validate-phase1.js', {
        INSTRUMENT: sym,
      });
    }
  }

  console.log('\n== Batch done ==');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
