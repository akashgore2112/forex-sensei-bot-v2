// scripts/daily-scan.js
#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");

function isoDay(d) { return d.toISOString().slice(0, 10); }

const TO   = process.env.TO   || isoDay(new Date());
const FROM = process.env.FROM || isoDay(new Date(Date.now() - 30 * 864e5));
const SYMS = (process.env.SYMS || "EUR-USD,GBP-USD,USD-JPY")
  .split(",").map(s => s.trim()).filter(Boolean);

if (!fs.existsSync("logs")) fs.mkdirSync("logs", { recursive: true });
const logfile = `logs/daily_${TO}.txt`;

fs.appendFileSync(logfile, `\n=== Daily MR scan ${FROM}..${TO} ===\n`);
for (const sym of SYMS) {
  fs.appendFileSync(logfile, `\n----- ${sym} -----\n`);
  const cmd = `node scripts/scan-mr.js --symbol=${sym} --from=${FROM} --to=${TO} --debug=1`;
  const out = execSync(cmd, { stdio: "pipe" }).toString();
  fs.appendFileSync(logfile, out + "\n");
}
console.log(`✅ wrote ${logfile}`);
