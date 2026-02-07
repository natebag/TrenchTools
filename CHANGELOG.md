# Changelog

All notable changes to TrenchSniper OS.

## [0.2.0] - 2026-02-07

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

## Roadmap / What's Coming

See [ROADMAP.md](./ROADMAP.md) for detailed feature planning.
