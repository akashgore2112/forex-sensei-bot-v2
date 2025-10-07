# forex-sensei-bot-v2
[![CI](https://img.shields.io/github/actions/workflow/status/akashgore2112/forex-sensei-bot-v2/ci.yml?branch=main)](../../actions)
![Node](https://img.shields.io/badge/node-20.x-blue)
![License](https://img.shields.io/badge/license-MIT-green)
Production-grade swing signal bot (Mean Reversion core, Momentum optional, AI validation gate).
Phases: P0 prep → P1 data/indicators → P2 MR strategy → P3 backtest → P4 AI validation → P5 orchestrator → P6 Telegram → P7 monitoring → P8 go-live.
## Quick Start
```bash
git clone https://github.com/akashgore2112/forex-sensei-bot-v2.git
cd forex-sensei-bot-v2
cp .env.example .env
npm ci
npm run dev:run
