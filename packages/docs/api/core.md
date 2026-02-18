# Core Package API

The `@trenchtools/core` package provides headless TypeScript utilities that can be used in Node.js environments.

**Location**: `packages/core/`

## Subpath Exports

```typescript
import { ... } from '@trenchtools/core'
import { ... } from '@trenchtools/core/wallet'
import { ... } from '@trenchtools/core/snipe'
import { ... } from '@trenchtools/core/trading'
import { ... } from '@trenchtools/core/browser'
import { ... } from '@trenchtools/core/connection'
import { ... } from '@trenchtools/core/config'
```

## Modules

### wallet
Keypair generation, BIP39 mnemonic support, HD wallet derivation, and encrypted storage.

```typescript
// Generate a new keypair
const keypair = generateKeypair()

// From mnemonic (HD wallet)
const keypair = fromMnemonic(mnemonic, derivationPath)
```

### snipe
Token sniping implementations for different DEXes.

```typescript
// PumpFun sniper client (reference implementation)
const client = new PumpFunClient(connection, wallet)
await client.buy(tokenMint, solAmount, slippage)
await client.sell(tokenMint, tokenAmount, slippage)
```

::: info
The core PumpFun client is a reference implementation. The UI uses PumpPortal API directly for better browser compatibility.
:::

### sniper-guard
Auto-sell engine with configurable triggers.

```typescript
const guard = new SniperGuardManager(connection)
guard.watch(position, {
  takeProfit: 2.0,      // Sell at 2x
  stopLoss: 0.5,        // Sell if drops 50%
  trailingStop: 0.2,    // 20% trailing stop
  timeLimit: 3600000,   // 1 hour max hold
})
```

### trading
Common trade types and interfaces shared across packages.

### shield
Honeypot detection and token risk analysis.

```typescript
const result = await analyzeToken(connection, tokenMint)
// result.isHoneypot, result.riskScore, result.warnings
```

### detection
Manipulation pattern detection powered by Allium.

### pnl
P&L calculation engine for position tracking.

### browser
Browser-compatible cryptography (Web Crypto API wrapper).

```typescript
import { BrowserWalletVault } from '@trenchtools/core/browser'

const vault = new BrowserWalletVault()
await vault.save(walletData, password)
const data = await vault.load(password)
```

### volume
PumpSwap venue detection and volume estimation utilities.

### orchestrator
Bot scheduling, persistence, and lifecycle management primitives.

### activity
Transaction history generation utilities.

### revenue
Creator fee management and fund transfer utilities.

### supply
Token burning utilities.

### liquidity
LP token locking utilities.

## Dependencies

The core package uses:
- `@solana/web3.js` — Solana blockchain interaction
- `@solana/spl-token` — SPL token standards
- `argon2` — Password hashing (Node.js only)
- `bip39` — BIP39 mnemonic generation
- `ed25519-hd-key` — HD wallet key derivation

::: warning
The core package's `argon2` dependency requires Node.js (native addon). The UI package stubs this out for browser compatibility using Web Crypto API.
:::
