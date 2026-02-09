# Changelog

All notable changes to TrenchSniper OS.

## [0.3.1] - 2026-02-09 - BROWSER COMPATIBILITY FIX

### 🔧 Vite Browser Polyfills

Fixed critical browser compatibility issues preventing the UI from loading.

#### Problem
- `ed25519-hd-key` uses Node.js `util.debuglog` and `util.inspect`
- `@noble/hashes/argon2` was importing as CommonJS causing `require is not defined`
- Vite was externalizing Node modules instead of polyfilling them

#### Solution - New Browser Stubs

**`src/stubs/util.ts`** - Full util module stub:
- `debuglog()` - Returns no-op function
- `inspect()` - JSON.stringify fallback
- `format()` - Printf-style formatting
- `promisify()`, `inherits()`, `deprecate()`
- `types` namespace for type checking

**`src/stubs/argon2.ts`** - Argon2 stub:
- Prevents CJS import errors
- Throws helpful error if actually called (not needed for Solana ops)

#### Vite Config Updates

```typescript
// Fixed aliases - use explicit strings, not regex
{ find: 'util', replacement: './src/stubs/util.ts' },
{ find: '@noble/hashes/argon2', replacement: './src/stubs/argon2.ts' },
{ find: 'argon2', replacement: './src/stubs/argon2.ts' },
```

#### Result
- ✅ UI loads without errors
- ✅ No more white page
- ✅ All navigation working
- ✅ Wallet connection ready

---

## [0.3.0] - 2026-02-09 - PRODUCTION DATA INTEGRATION

### 🔐 Wallet Security (Production Grade)

- **HD Wallet Generation** - BIP39 + BIP44 with Solana path m/44'/501'/0'/0/{index}
- **ed25519-hd-key** - Real Solana keypair derivation
- **AES-256-GCM Encryption** - Military-grade wallet encryption
- **Argon2id KDF** - 64MB memory, 3 iterations, 32-byte salt
- **WalletVault Class** - Secure lock/unlock/export/import operations
- **File & Memory Storage** - Flexible storage adapters

### 💰 Treasury (Real Blockchain Data)

- **Real SOL Balances** - `Connection.getBalance()` for live data
- **SPL Token Balances** - `getTokenAccountsByOwner` for all tokens
- **WebSocket Subscriptions** - Real-time balance updates
- **Smart Caching** - 30-second TTL with automatic invalidation
- **Formatted Display** - "1.234567 SOL" style formatting

### ⚙️ Settings Persistence

- **localStorage** - Browser persistence with schema validation
- **Cross-Tab Sync** - Storage events for multi-tab consistency
- **Debounced Auto-Save** - 500ms debounce prevents excessive writes
- **Version Migration** - Schema versioning for future updates
- **Export/Import** - Full state backup and restore

### 🛡️ Shield (Real Token Analysis)

- **On-Chain Authority Checks** - `getParsedAccountInfo` for mint/freeze
- **DexScreener API** - Real liquidity, volume, and price data
- **Transfer Pattern Analysis** - Honeypot detection via buy/sell ratios
- **Risk Score 0-100** - Comprehensive safety scoring
- **5-Minute Cache** - Performance optimization with TTL
- **Formatted Reports** - Telegram-ready safety reports

### 📦 Technical

- **Real crypto functions** - No mocks or stubs
- **TypeScript strict** - Full type safety
- **Production dependencies** - @solana/web3.js, bip39, argon2, ed25519-hd-key

---

## [0.2.0] - 2026-02-07 - FEATURE COMPLETE

### ✨ Auto-Sell & Risk Management

#### Auto-Sell Engine
- **Take Profit** - Auto-sell when price reaches X% gain
- **Stop Loss** - Auto-sell when price drops Y% from entry
- **Trailing Stop** - Follow peak price, sell on X% drop
- **Time-Based** - Auto-sell after Z minutes
- **Partial Sells (DCA Out)** - Lock in profits at 25%/50%/75% levels
- **Event-Driven** - Real-time price monitoring with triggers

#### Sell All 💨
- **Emergency Exit** - One-click sell across ALL positions
- **Wallet Exclusions** - Protect dev/treasury wallets
- **Progress Tracking** - Monitor partial completions, failures
- **Summary Reports** - Total SOL received, positions exited

#### Sniper Guard 🛡️
- **Launch Protection** - Monitor external buys during token launch
- **Threshold Monitoring** - Set max external SOL (e.g., 4 SOL)
- **Trigger Modes** - `STOP_BUYING` or `EMERGENCY_EXIT`
- **Whitelist** - Auto-exclude dev, funder, MEV, holder wallets
- **Real-Time** - Event-driven execution with logging

### 📊 P&L Tracking

- **Realized P&L** - Completed trades profit/loss
- **Unrealized P&L** - Open position current value
- **Position Tracking** - Entry/exit prices, multi-wallet support
- **Token Summaries** - Aggregate across all wallets per token
- **Wallet Analytics** - Win/loss rates, largest gains/losses
- **Portfolio Reports** - Full portfolio P&L snapshot
- **Calculators** - Realized + unrealized gain computation

### 🛡️ Shield - Honeypot Detection

- **Mint Authority Check** - Detect if dev can mint more tokens
- **Freeze Authority Check** - Detect if wallets can be frozen
- **Fee Analysis** - High sell fees (>10%), extreme fees (>25% = honeypot)
- **Sell Disabled Detection** - Can't sell = honeypot
- **Liquidity Check** - Locked liquidity verification
- **Dev Holdings Analysis** - Excessive dev and whale concentration risks
- **Safety Score** - 0-100 risk rating
- **Actionable Alerts** - Telegram-friendly formatted reports

### 💰 Revenue Features

- **Claim Creator Fees** - Collect bonding curve migration fees
- **Token Transfers** - Single recipient and batch airdrop support
- **Buyback Engine** - Treasury token purchases with DCA scheduling
- **Budget Control** - Price limits, slippage protection, time windows

---

## [0.1.0] - 2026-02-07

### ✨ Core Features

#### Trading Engine
- **PumpFun Bonding Curve** - Full buy/sell with slippage control, migration detection
- **Raydium AMM** - Pool discovery, quote calculation, swap execution
- **Meteora DLMM** - Concentrated liquidity bin trading
- **Smart Router** - Auto-routes to best DEX, detects Pump→Raydium migrations
- **Jito Bundles** - MEV protection for snipes

#### Token Launch
- **Token Creation** - Deploy on PumpFun with IPFS metadata upload
- **Bonding Curve Deployment** - Complete deployment flow

#### Wallet Management
- **HD Wallet Generation** - Mnemonic-based wallet creation
- **AES-256-GCM Encryption** - Secure key storage with Argon2id
- **Batch Operations** - Multi-wallet coordination

#### Sniper Tools
- **Token Sniper** - Multi-wallet coordinated sniping
- **Auto-Sniper** - Mempool monitoring with auto-buy rules
- **Strategy Configs** - aggressive.yaml, balanced.yaml, conservative.yaml

#### Bot & UI
- **Telegram Bot** - Real-time alerts, sniper control, portfolio view
- **Web UI Dashboard** - Vite + React, dark mode, live monitoring
- **CLI Interface** - Full command-line control

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for remaining features (Burn Supply, Withdraw, DexScreener updates, etc.)

**Current Status: v0.2.0 FEATURE COMPLETE - 90% of roadmap implemented**
