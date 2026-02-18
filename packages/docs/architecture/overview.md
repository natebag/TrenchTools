# Architecture Overview

TrenchTools is a monorepo with two primary packages: a TypeScript core library and a React dashboard UI.

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser (UI)                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Sniper  │  │  Volume  │  │   Bots   │ ...  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │            │
│  ┌────▼──────────────▼──────────────▼────┐      │
│  │         Context Providers              │      │
│  │  Wallet │ TxHistory │ PnL │ Network   │      │
│  └────┬──────────────┬──────────────┬────┘      │
│       │              │              │            │
│  ┌────▼──────┐  ┌────▼──────┐  ┌───▼─────┐    │
│  │  Wallet   │  │   DEX     │  │  Price   │    │
│  │  Manager  │  │   Layer   │  │  Feeds   │    │
│  └────┬──────┘  └────┬──────┘  └───┬─────┘    │
│       │              │              │           │
└───────┼──────────────┼──────────────┼───────────┘
        │              │              │
   localStorage   Jupiter API    DexScreener
                  PumpPortal API   Solana RPC
```

## Package Responsibilities

### @trenchtools/core
Server-side / headless TypeScript library. Provides:
- Wallet generation, encryption, key management
- Trading infrastructure and types
- P&L calculation engine
- Honeypot detection (Shield)
- Manipulation detection (Allium integration)
- Bot orchestration primitives
- Volume estimation

Built with **tsup** for Node.js consumption.

### @trenchtools/ui
The main product — a React 18 SPA that runs entirely in the browser. Provides:
- Full dashboard with sidebar navigation
- All trading features (sniper, volume, bots)
- Wallet management with browser encryption
- Real-time P&L and position tracking
- Charts and analytics

Built with **Vite** + **TypeScript** + **Tailwind CSS**.

## Data Flow

```
User Action → Component → Hook/Context → DEX Layer → Solana RPC
                                    ↓
                              addTrade()
                                    ↓
                            TxHistoryContext
                                    ↓
                              PnLContext
                                    ↓
                            localStorage
```

1. User initiates an action (snipe, start bot, etc.)
2. Component calls the appropriate hook or context method
3. Hook interacts with the DEX layer for on-chain operations
4. Trade result is recorded via `addTrade()`
5. P&L auto-recalculates from trade history
6. State persists to localStorage
