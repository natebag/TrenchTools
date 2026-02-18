---
layout: home
title: TrenchTools
titleTemplate: The Operating System for Solana Trench Warfare

hero:
  name: TrenchTools
  text: The Operating System for Solana Trench Warfare
  tagline: Open-source market making and trading toolkit for Solana. Snipe. Boost. Dominate.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/natebag/Trenchtools

features:
  - icon: 🎯
    title: Token Sniper
    details: Auto-detect PumpFun vs Jupiter. Snipe any token with configurable slippage, priority fees, and auto-sell triggers (TP, SL, trailing stop).
  - icon: 📈
    title: Market Making
    details: Two modes — Manual Volume with multi-wallet patterns (organic, steady, burst, wave) and Bot Groups that auto-generate wallets, fund, trade, and clean up on stop.
  - icon: 📉
    title: Token Charts
    details: Real-time price charts powered by Lightweight Charts. Candlesticks, volume bars, and interactive time ranges for any Solana token.
  - icon: 💼
    title: Treasury & Wallets
    details: Browser-encrypted HD wallet vault. Generate, import, fund, sweep, and manage sniper, treasury, and burner wallets from one dashboard.
  - icon: 📊
    title: P&L Analytics
    details: Real-time position tracking with DexScreener price feeds. Entry prices, unrealized/realized P&L, and daily profit charts.
  - icon: 🛡️
    title: Shield Scanner
    details: Honeypot detection and rug-pull analysis. Check mint authority, pause flags, transfer restrictions, and risk scoring before you buy.
  - icon: 🐋
    title: Whale Alerts
    details: Monitor large wallet movements and whale activity on tokens you're tracking.
  - icon: 🔍
    title: Manipulation Detection
    details: Powered by Allium. Detect wallet clustering, wash trading, coordinated timing, and interval regularity patterns.
---

## Why TrenchTools?

Most Solana trading tools are either paid bots with revenue shares, closed-source black boxes, or half-finished scripts on GitHub. TrenchTools is different:

- **Free & Open Source** — MIT licensed, audit the code yourself
- **Self-Hosted** — Runs on your machine, your keys never leave your browser
- **Multi-DEX** — Jupiter, PumpFun (PumpPortal API), with Raydium and Meteora coming
- **Real Dashboard** — Not a CLI script — a full React UI with real-time state
- **Battle-Tested** — Every feature makes real trades on mainnet

```bash
git clone https://github.com/natebag/Trenchtools.git
cd Trenchtools
pnpm install
pnpm start
```
