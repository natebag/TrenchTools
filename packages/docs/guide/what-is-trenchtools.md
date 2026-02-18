# What is TrenchTools?

TrenchTools is an open-source, self-hosted trading dashboard for Solana token operations. It provides a unified interface for sniping, market making, automated bot trading, wallet management, and portfolio analytics.

## The Problem

Solana token launches move fast. Traders need to:
- Snipe tokens within seconds of launch
- Generate organic-looking volume across multiple wallets
- Track positions and P&L across dozens of wallets
- Detect honeypots before buying
- Manage treasury funds and sub-wallets efficiently

Most tools that solve these problems are paid services that take a cut of your trades, require you to trust a third party with your keys, or are closed-source.

## The Solution

TrenchTools puts all of these tools in a single self-hosted dashboard:

| Tool | What It Does |
|------|-------------|
| **Sniper** | Buy tokens instantly with auto-sell triggers |
| **Market Making Engine** | Multi-wallet volume with configurable patterns |
| **Bot Groups** | Automated market-making units with full wallet lifecycle |
| **Treasury** | Generate, fund, sweep, and manage wallets |
| **P&L Tracker** | Real-time position tracking with price feeds |
| **Shield** | Honeypot detection and rug analysis |
| **Whale Alerts** | Monitor large wallet movements |
| **Detection** | Manipulation pattern recognition |

## Key Principles

### Your Keys, Your Machine
Everything runs locally. Wallet keys are encrypted in your browser using Web Crypto API with Argon2 key derivation. No server, no cloud, no third-party custody.

### Auto-Routing
Paste any Solana token CA and TrenchTools figures out the rest. If the token is on PumpFun's bonding curve, it routes through PumpPortal API. If it's graduated to Raydium/Jupiter, it uses the Jupiter aggregator. You don't need to know which DEX a token is on.

### Real Trades, Not Simulations
Every action in TrenchTools executes real on-chain transactions (on whichever network you select). Market making creates real swaps. Bot groups generate real trades. P&L is calculated from real transaction history.

### Open Source
MIT licensed. Read the code, audit the logic, contribute features, fork it for your own use. No hidden fees, no token, no governance.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Core Library**: TypeScript + tsup (Node.js compatible)
- **Blockchain**: @solana/web3.js
- **DEX Integration**: Jupiter API + PumpPortal API
- **Build System**: Turbo monorepo + pnpm
- **Charts**: Recharts + Lightweight Charts
