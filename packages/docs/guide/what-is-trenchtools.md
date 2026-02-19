# What is TrenchTools?

TrenchTools is an open-source trading dashboard for Solana token operations. It provides a unified interface for sniping, market making, automated bot trading, wallet management, and portfolio analytics.

Use the **hosted version** at [app.trenchtools.io](https://app.trenchtools.io) or **self-host** for free.

## The Problem

Solana token launches move fast. Traders need to:
- Snipe tokens within seconds of launch
- Generate organic-looking volume across multiple wallets
- Track positions and P&L across dozens of wallets
- Detect honeypots before buying
- Manage treasury funds and sub-wallets efficiently

Most tools that solve these problems are paid services that take a cut of your trades, require you to trust a third party with your keys, or are closed-source.

## The Solution

TrenchTools puts all of these tools in a single dashboard:

| Tool | What It Does |
|------|-------------|
| **Sniper** | Buy tokens instantly with auto-sell triggers |
| **Market Making** | Multi-wallet volume with configurable patterns |
| **Bot Groups** | Automated market-making units with parallel wallet trading |
| **Activity Generator** | Generate organic on-chain activity with auto sell-back |
| **Treasury** | Generate, fund, sweep, and manage wallets |
| **P&L Tracker** | Real-time position tracking with DexScreener price feeds |
| **Shield** | Honeypot detection and rug analysis |
| **Charts** | Real-time candlestick charts for any Solana token |
| **Detection** | Manipulation pattern recognition (Allium) |

## Hosted vs Self-Hosted

| | Hosted (app.trenchtools.io) | Self-Hosted (Free) |
|---|---|---|
| **Setup** | None — sign in and go | Clone repo, `pnpm install`, `pnpm start` |
| **Auth** | Phantom wallet or email/password | None needed |
| **API Keys** | Provided (Jupiter, Helius, RPC) | Bring your own |
| **Fee** | 0.5% per swap | Free |
| **Keys** | Encrypted in your browser (never sent to server) | Encrypted in your browser |
| **Cross-Device** | Vault syncs across devices (encrypted) | Local browser only |

## Key Principles

### Non-Custodial
In both hosted and self-hosted modes, wallet keys are encrypted in your browser using Web Crypto API with AES-256-GCM. The server (in hosted mode) only stores the encrypted blob — it can never read your keys.

### Auto-Routing
Paste any Solana token CA and TrenchTools figures out the rest. If the token is on PumpFun's bonding curve, it routes through PumpPortal API. If it's graduated to a DEX, it routes through Jupiter (which aggregates across Raydium, Orca, and others). You don't need to know which DEX a token is on.

### Real Trades, Not Simulations
Every action executes real on-chain transactions. Market making creates real swaps. Bot groups generate real trades. P&L is calculated from real transaction history.

### Open Source
MIT licensed. Read the code, audit the logic, contribute features, fork it for your own use. No hidden fees, no token, no governance.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Core Library**: TypeScript + tsup (Node.js compatible)
- **Blockchain**: @solana/web3.js
- **DEX Integration**: Jupiter API + PumpPortal API
- **Build System**: Turbo monorepo + pnpm
- **Charts**: Recharts + Lightweight Charts
- **Backend** (hosted only): Hono + PostgreSQL + Drizzle ORM
