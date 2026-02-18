# TrenchTools Roadmap

---

## v0.4.0 STATUS - 2026-02-18 - DEX INTEGRATION + WALLET OPS

### COMPLETED

| Feature | Status | Details |
|---------|--------|---------|
| PumpFun DEX Integration | LIVE | PumpPortal API swapper (buy/sell pre-graduation tokens) |
| Auto-routing (Sniper) | LIVE | Detects bonding curve, routes PumpFun vs Jupiter automatically |
| Auto-routing (Volume) | LIVE | Same PumpFun/Jupiter detection for market making |
| Auto-routing (Sell All) | LIVE | Jupiter first, PumpFun fallback for pre-graduation tokens |
| Position Cards (PnL) | LIVE | Axiom-style cards with real-time DexScreener prices |
| Position Sell Button | LIVE | Sell from position card, auto-routes PumpFun/Jupiter with fallback |
| Trade Source Tracking | LIVE | Trades tagged sniper/volume/treasury, PnL only tracks sniper |
| Bulk Wallet Generate | LIVE | Generate 1-20 wallets at once, 100 wallet cap, auto-naming (Name-1, Name-2) |
| Bulk Wallet Delete | LIVE | Select multiple wallets, bulk delete with confirmation |
| Selection-aware Ops | LIVE | Fund/Sweep/Sell All respect wallet selection (or all if none selected) |
| Sweep-on-Delete | LIVE | Deleting a wallet auto-sweeps remaining SOL back to treasury |
| Wallet Type Selector | LIVE | Sniper/Treasury/Burner type in Add Sub-Wallet modal |
| Wallet Type Persistence | LIVE | Type saved in encrypted vault, survives lock/unlock |
| Wallet Update (rename/retype) | LIVE | Edit wallet name and type in-place |

---

## v0.3.1 STATUS - 2026-02-09 - BROWSER COMPATIBILITY FIX

### COMPLETED

| Feature | Status | Details |
|---------|--------|---------|
| Util Browser Stub | LIVE | debuglog, inspect, format, promisify |
| Argon2 Browser Stub | LIVE | Prevents CJS import errors |
| Vite Config Fix | LIVE | Explicit string aliases (not regex) |
| White Page Fix | LIVE | UI now loads correctly |

**The Problem:** Node.js crypto libraries (`ed25519-hd-key`, `@noble/hashes`) use Node-only APIs that don't exist in browsers.

**The Fix:** Custom browser stubs that provide minimal compatibility layer for Vite bundling.

---

## v0.3.0 STATUS - 2026-02-09 - PRODUCTION DATA INTEGRATION

### COMPLETED

| Feature | Status | Details |
|---------|--------|---------|
| HD Wallet Generation | LIVE | BIP39 + BIP44, ed25519-hd-key |
| AES-256-GCM Encryption | LIVE | Argon2id KDF (64MB, 3 iterations) |
| WalletVault Storage | LIVE | Lock/unlock, export/import |
| Real SOL Balances | LIVE | Connection.getBalance() |
| SPL Token Balances | LIVE | getTokenAccountsByOwner |
| WebSocket Subscriptions | LIVE | Real-time balance updates |
| Balance Caching (30s TTL) | LIVE | Smart cache with invalidation |
| Settings Persistence | LIVE | localStorage with validation |
| Cross-Tab Sync | LIVE | Storage event listeners |
| Debounced Auto-Save | LIVE | 500ms debounce |
| Shield On-Chain Checks | LIVE | getParsedAccountInfo |
| DexScreener API | LIVE | Liquidity, volume, price |
| Risk Score 0-100 | LIVE | Real analysis, 5min cache |

---

## v0.2.0 STATUS - 2026-02-07 - FEATURE COMPLETE

### COMPLETED

| Feature | Commit | Status |
|---------|--------|--------|
| Burn Supply | ed19795 | Token burning, LP burning, batch burn |
| Withdraw SOL | aedf4ca | Single + batch withdrawal, rent protection |
| DexScreener | 7629161 | Listing monitoring, pair data, profile guidelines |
| Supply Exports | 1eff6f6 | Wired to core index |
| Auto-Sell Engine | - | Take profit, stop loss, trailing, DCA out |
| Sell All | - | Emergency exit, exclusions |
| Sniper Guard | - | Launch protection, thresholds |
| P&L Tracking | - | Realized + unrealized, analytics |
| Shield Detection | - | Honeypot, rug detection |
| Revenue Features | - | Creator fees, buyback engine |

---

## Future Enhancements

### v0.5.0 - Polish & Performance
- [ ] P&L Cards UI polish (icons, animations)
- [ ] Performance optimizations (code splitting)
- [ ] Raydium DEX integration
- [ ] Meteora DEX integration
- [ ] Portfolio dashboard with historical charts

### v0.6.0 - Platform Expansion
- [ ] Discord Bot
- [ ] Mobile PWA
- [ ] Advanced analytics dashboard
- [ ] Copy trading

### v1.0.0 - Enterprise
- [ ] Multi-signature support
- [ ] Team management
- [ ] Audit trail
- [ ] API access controls

---

## All Core Features LIVE

**TrenchTools is PRODUCTION READY!**

- Real blockchain data (no mocks)
- Encrypted wallet storage (Web Crypto API)
- Live token analysis (DexScreener)
- PumpFun + Jupiter auto-routing
- Persistent settings + cross-tab sync
- Bulk wallet operations with selection
