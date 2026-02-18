# TrenchTools 🎯

**Open-source alternative to Proxima.tools for Solana market making and trading.**

> Democratize the trenches. Free the tools.

## Overview

TrenchTools provides professional-grade token launching, sniping, and trading tools for the Solana ecosystem - **completely free and open source**.

While paid tools like Proxima charge hundreds per month for access, TrenchTools puts the same capabilities in everyone's hands.

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [**Getting Started**](./docs/GETTING_STARTED.md) | Installation, setup, and first steps |
| [**Bot Configuration**](./docs/BOT_CONFIGURATION.md) | Market making bot settings and management |
| [**Detection Guide**](./docs/DETECTION_GUIDE.md) | Manipulation detection and analysis |
| [**Market Making Patterns**](./docs/MARKET_MAKING_PATTERNS.md) | Market making strategies |
| [**FAQ**](./docs/FAQ.md) | Common questions and troubleshooting |

---

## Features

### 🚀 Trading
| Feature | Description |
|---------|-------------|
| **Token Creation** | Launch tokens on PumpFun with metadata upload |
| **PumpFun Trading** | Buy/sell on bonding curves |
| **Raydium Trading** | AMM pool swaps with quote calculation |
| **Meteora DLMM** | Concentrated liquidity pool trading |
| **Smart Router** | Auto-route to best DEX with migration detection |
| **Jito Bundles** | MEV protection through Jito bundle builder |

### 🤖 Orchestrator
| Feature | Description |
|---------|-------------|
| **Market Making Bots** | Automated trading with configurable intervals |
| **Market Making Patterns** | Organic, steady, burst, and wave patterns |
| **Multi-Bot Management** | Run 50+ bots concurrently |
| **State Persistence** | WAL-based recovery and snapshots |
| **RPC Load Balancing** | Multiple endpoints with health checks |

### 🛡️ Detection (Powered by Allium)
| Feature | Description |
|---------|-------------|
| **Manipulation Scoring** | 0-100 risk score for any token |
| **Pattern Detection** | Wallet clustering, interval regularity, coordination |
| **Real-Time Monitoring** | Continuous analysis with alerts |
| **On-Chain Analysis** | Deep transaction and funding pattern analysis |

### 💼 Wallet Management
| Feature | Description |
|---------|-------------|
| **HD Generation** | Derive multiple wallets from seed |
| **AES-256 Encryption** | Military-grade vault security |
| **Batch Operations** | Fund, consolidate, and manage at scale |
| **Multi-Wallet Sniping** | Coordinate across wallet arrays |

### 🖥️ Interfaces
| Interface | Status |
|-----------|--------|
| **Web UI Dashboard** | ✅ React + Vite |
| **CLI** | ✅ Full command support |
| **Telegram Bot** | ✅ Basic commands |
| **Portfolio Analytics** | 📋 Planned |

## Quick Start\n\n`ash\n# Clone and install\ngit clone https://github.com/natebag/Trenchtools.git\ncd TrenchTools\npnpm install\npnpm build\n`\n\n### Run the App\n`ash\n# Start the web UI (opens at http://localhost:5173)\npnpm start\n\n# Or run in dev mode with hot reload\npnpm dev\n`\n\n### Configuration

Copy the example config and edit with your settings:

```bash
cp trench.example.yaml trench.yaml
```

```yaml
# trench.yaml
rpc:
  mainnet: "https://your-rpc-endpoint.com"

wallets:
  main: "/path/to/keypair.json"
  snipe:
    - "/path/to/wallet1.json"
    - "/path/to/wallet2.json"

strategy: balanced  # aggressive | balanced | conservative
```

### CLI Usage

```bash
# Snipe a token on PumpFun
pnpm cli snipe <TOKEN_MINT> --amount 0.1 --slippage 100

# Snipe with multiple wallets
pnpm cli snipe <TOKEN_MINT> --amount 0.1 --wallets 3

# Snipe with Jito MEV protection
pnpm cli snipe <TOKEN_MINT> --amount 0.1 --jito --tip 10000

# Exit a position (sell tokens)
pnpm cli exit <TOKEN_MINT> --percent 100

# Generate new wallets
pnpm cli wallet --generate 5
```

## New Features

### 🚀 Token Creation on PumpFun

```typescript
import { createToken, TokenCreator } from '@trenchtools/core';

const result = await createToken(connection, {
  wallet,
  metadata: {
    name: 'My Token',
    symbol: 'MTK',
    description: 'A cool token',
    twitter: '@mytoken',
    telegram: 't.me/mytoken',
    website: 'https://mytoken.com',
  },
});

console.log('Token created:', result.mint.toString());
```

### 🔄 Smart Router with Migration Detection

```typescript
import { SmartRouter, router } from '@trenchtools/core';

// Auto-detect best DEX
const bestDex = await router.getBestDex(connection, tokenMint);

// Detect if token migrated from PumpFun to Raydium
const migration = await router.detectPoolMigration(connection, tokenMint);
if (migration.migrated) {
  console.log(`Migrated from ${migration.from} to ${migration.to}`);
}

// Get best quote across all DEXs
const quote = await router.getBestQuote(connection, {
  inputMint: SOL_MINT,
  outputMint: tokenMint,
  amount: 1_000_000_000, // 1 SOL in lamports
  slippageBps: 100,
});
```

### 📊 Multi-DEX Trading

```typescript
import { raydium, meteora } from '@trenchtools/core';

// Raydium AMM swap
const rayQuote = await raydium.getQuote(connection, params);
const rayResult = await raydium.swap(connection, { wallet, quote: rayQuote });

// Meteora DLMM swap
const metQuote = await meteora.getQuote(connection, params);
const metResult = await meteora.swap(connection, { wallet, quote: metQuote });
```

### 📋 Strategy Configs

Pre-built strategies in `packages/cli/src/strategies/`:

| Strategy | Risk | Buy Size | Take Profit | Stop Loss |
|----------|------|----------|-------------|-----------|
| Aggressive | High | 0.5 SOL | 2x | 50% |
| Balanced | Medium | 0.25 SOL | 1.75x | 40% |
| Conservative | Low | 0.1 SOL | 1.5x | 30% |

```typescript
import { loadStrategyByName } from '@trenchtools/cli/strategies';

const strategy = loadStrategyByName('aggressive');
console.log(strategy.autoSell.takeProfitMultiplier); // 2.0
```

## Architecture

```
TrenchTools/
├── packages/
│   ├── core/              # Core trading modules
│   │   └── src/
│   │       ├── wallet/       # Wallet generation & encryption
│   │       ├── snipe/        # DEX trading (PumpFun, Raydium, Meteora)
│   │       ├── detection/    # Manipulation detection (Allium)
│   │       ├── orchestrator/ # Bot state machine & scheduling
│   │       ├── activity/     # Volume pattern generation
│   │       └── pnl/          # P&L tracking & analytics
│   │
│   ├── ui/               # Web dashboard (React + Vite)
│   │   └── src/
│   │       ├── components/   # BotManager, VolumeControl, Detection
│   │       └── context/      # WalletContext, state management
│   │
│   ├── snipe/            # Sniping engine
│   │   └── src/
│   │       ├── sniper.ts     # TokenSniper class
│   │       └── jito.ts       # Jito bundle builder
│   │
│   ├── cli/              # Command line interface
│   │   └── src/
│   │       ├── commands/     # snipe, exit, wallet, launch
│   │       └── strategies/   # aggressive/balanced/conservative
│   │
│   └── bot-telegram/     # Telegram bot interface
│
├── docs/                 # Documentation
│   ├── GETTING_STARTED.md
│   ├── BOT_CONFIGURATION.md
│   ├── DETECTION_GUIDE.md
│   ├── MARKET_MAKING_PATTERNS.md
│   └── FAQ.md
│
└── trench.example.yaml   # Example configuration
```

## Packages

### @trenchtools/core

Core trading functionality:

```typescript
import { 
  // PumpFun
  PumpFunClient,
  buy, sell, isOnPumpFun,
  
  // Token Creation
  TokenCreator, createToken, uploadMetadata,
  
  // Raydium
  raydium,
  
  // Meteora
  meteora,
  
  // Smart Router
  router, SmartRouter,
} from '@trenchtools/core';
```

### @trenchtools/snipe

High-level sniping engine with multi-wallet coordination and Jito support.

### @trenchtools/cli

Full CLI with strategy support.

## Contributing

This is an open-source project. Contributions welcome!

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Disclaimer

This software is for educational purposes. Use at your own risk. Always DYOR before trading.

## License

MIT - Free for everyone.

---

**Powered by the BagBros collective** 🤖💼
