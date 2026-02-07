# TrenchSniper OS 🎯

**Open-source alternative to Proxima.tools for Solana token launching and sniping.**

> Democratize the trenches. Free the tools.

## Overview

TrenchSniper OS provides professional-grade token launching, sniping, and market making tools for the Solana ecosystem - **completely free and open source**.

While paid tools like Proxima charge hundreds per month for access, TrenchSniper OS puts the same capabilities in everyone's hands.

## Features

### ✅ Completed
- **Wallet Management**: HD generation, AES-256 encryption, batch operations
- **Core Infrastructure**: Multi-wallet coordination, transaction bundling
- **Snipe Module**: PumpFun bonding curve integration with buy/sell
- **CLI**: Full command-line interface for sniping operations
- **Jito Bundles**: MEV protection through Jito bundle builder
- **Multi-Wallet**: Coordinated sniping across multiple wallets

### 📋 Planned
- Token launch command (PumpFun creation)
- Web UI dashboard
- Telegram bot interface
- Multi-DEX routing (Jupiter, Raydium, Meteora)
- Portfolio analytics

## Quick Start

```bash
# Clone and install
git clone https://github.com/natebag/TrenchSniper-OS.git
cd TrenchSniper-OS
pnpm install
pnpm build
```

### Configuration

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

defaults:
  slippageBps: 100      # 1% slippage
  priorityFee: 5000
  network: mainnet
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

# Partial exit
pnpm cli exit <TOKEN_MINT> --percent 50

# Generate new wallets
pnpm cli wallet --generate 5

# Check wallet balances
pnpm cli wallet --balance

# Fund snipe wallets from main
pnpm cli wallet --fund 0.5

# Collect SOL back to main wallet
pnpm cli wallet --collect
```

## Architecture

```
TrenchSniper-OS/
├── packages/
│   ├── core/           # Wallet, encryption, PumpFun integration
│   │   └── src/
│   │       ├── wallet/    # Wallet generation & management
│   │       ├── trading/   # Trading types
│   │       └── snipe/     # PumpFun bonding curve client
│   │
│   ├── snipe/          # Sniping engine
│   │   └── src/
│   │       ├── sniper.ts  # TokenSniper class
│   │       └── jito.ts    # Jito bundle builder
│   │
│   ├── cli/            # Command line interface
│   │   └── src/
│   │       ├── commands/  # snipe, exit, launch, wallet
│   │       └── config.ts  # YAML config loader
│   │
│   └── ui/             # Web interface (coming soon)
│
├── trench.example.yaml # Example configuration
└── docs/               # Documentation
```

## Packages

### @trenchsniper/core

Core functionality including:
- Wallet generation (HD derivation, batch creation)
- PumpFun bonding curve integration
- Buy/sell on bonding curve
- Migration detection

```typescript
import { PumpFunClient, generateWallets } from '@trenchsniper/core';

const client = new PumpFunClient(connection);

// Check if token is on PumpFun
const info = await client.getTokenInfo(tokenMint);

// Buy tokens
const result = await client.buy(wallet, tokenMint, solAmount, slippageBps);

// Sell tokens
const result = await client.sell(wallet, tokenMint, tokenAmount, slippageBps);
```

### @trenchsniper/snipe

High-level sniping engine:
- Multi-wallet coordination
- Jito bundle support
- Position tracking

```typescript
import { TokenSniper, JitoBundleBuilder } from '@trenchsniper/snipe';

const sniper = new TokenSniper({
  connection,
  wallets: [wallet1, wallet2, wallet3],
  useJito: true,
});

// Snipe with all wallets
const results = await sniper.snipe({
  tokenMint,
  solAmountPerWallet: 0.1,
});

// Exit position
const exitResults = await sniper.exit({
  tokenMint,
  sellPercent: 100,
});
```

### @trenchsniper/cli

Full CLI with commands:
- `snipe` - Buy tokens on PumpFun
- `exit` - Sell token positions
- `launch` - Create new tokens (coming soon)
- `wallet` - Wallet management

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
