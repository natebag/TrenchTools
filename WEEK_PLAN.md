# TrenchSniper-OS Week Plan
**Feb 9-15, 2026** | Goal: Production-Ready Market Making Toolkit

---

## 📅 Day 1 (Sunday Feb 9) — Setup & Smoke Test
**Status:** ✅ In Progress

- [x] Pull latest from Nate's repo
- [x] Verify build passes
- [x] Launch UI locally
- [ ] Smoke test all panels in UI:
  - [ ] Treasury — View balances
  - [ ] Wallets — Generate test wallet
  - [ ] Bot Manager — Create bot config (don't start)
  - [ ] Detection — Analyze a known token
  - [ ] Volume Control — Review patterns
  - [ ] Sniper — Check interface
  - [ ] Shield — Test rug scanner

**Owner:** Lewy + General

---

## 📅 Day 2 (Monday Feb 10) — Mainnet Read-Only Testing
**Goal:** Validate detection & analysis on real mainnet data

### Tasks:
- [ ] Set up mainnet RPC endpoint (Helius/QuickNode)
- [ ] Configure Allium API key
- [ ] Analyze 5 live mainnet tokens:
  - 1 blue chip (BONK, WIF, etc.)
  - 1 trending token
  - 1 suspected bot activity
  - 1 fresh PumpFun launch
  - 1 known rug (historical)
- [ ] Validate detection scores make sense
- [ ] Test Shield rug scanner on live token
- [ ] Review wallet clustering patterns

### No Risk:
- Read-only operations
- No wallet connections yet
- Just data analysis

**Owner:** General (API setup) + Lewy (validation)

---

## 📅 Day 3 (Tuesday Feb 11) — Small Mainnet Trades
**Goal:** First real transactions with minimal capital

### Tasks:
- [ ] Generate fresh wallet set (3-5 wallets)
- [ ] Fund with small amounts (0.1 SOL each)
- [ ] Pick a liquid token (high volume, low risk)
- [ ] Execute single manual swap via UI
- [ ] Verify transaction on Solscan
- [ ] Test buy → sell round trip
- [ ] Check slippage handling
- [ ] Test priority fee settings

### Risk Management:
- Max 0.5 SOL total exposure
- Liquid tokens only
- Manual trades first (no bots yet)

**Owner:** Lewy (execution) + General (monitoring)

---

## 📅 Day 4 (Wednesday Feb 12) — Bot Manager Live Testing
**Goal:** Run orchestrated bots on mainnet

### Tasks:
- [ ] Create bot config for chosen token:
  - Conservative settings
  - Low volume (0.01 SOL per trade)
  - Long intervals (5-10 min)
- [ ] Start single bot
- [ ] Monitor for 1 hour
- [ ] Check bot state transitions
- [ ] Test pause/resume
- [ ] Test stop and cleanup
- [ ] Review P&L after session

### Add:
- [ ] Real-time tx log in UI
- [ ] Bot health status indicators
- [ ] Alert on failed transactions

**Owner:** Lewy (running) + Nate (fixes)

---

## 📅 Day 5 (Thursday Feb 13) — Volume Patterns & Sniper
**Goal:** Test volume strategies on real token

### Tasks:
- [ ] Test each volume pattern (1 hour each):
  - Organic (random intervals)
  - Steady (consistent timing)
  - Burst (volume spikes)
  - Wave (oscillating)
- [ ] Compare on-chain results to intended pattern
- [ ] Monitor for any detection flags (self-check)
- [ ] Test sniper on trending PumpFun token
- [ ] Measure snipe latency vs competition

### Add:
- [ ] Pattern visualization (actual vs intended)
- [ ] Volume session analytics
- [ ] Snipe success rate tracking

**Owner:** Nate (sniper) + Lewy (volume)

---

## 📅 Day 6 (Friday Feb 14) — Security & Edge Cases
**Goal:** Harden before wider use

### Tasks:
- [ ] Test wallet encryption strength
- [ ] Wrong password handling
- [ ] Network disconnect recovery
- [ ] RPC failover (circuit breaker)
- [ ] Max concurrent bots stress test
- [ ] Error message review (user-friendly?)
- [ ] Test rapid start/stop cycles
- [ ] Review all console errors

### Add:
- [ ] Session timeout / auto-lock
- [ ] Wallet backup/restore
- [ ] Confirmation dialogs for destructive actions
- [ ] Rate limiting indicators

**Owner:** General (security) + Lewy (UX testing)

---

## 📅 Day 7 (Saturday Feb 15) — Polish & Ship
**Goal:** v0.1.0 release ready

### Tasks:
- [ ] Fix all bugs found during week
- [ ] Write documentation:
  - Getting started guide
  - Bot configuration guide  
  - Detection interpretation
  - Troubleshooting FAQ
- [ ] Clean up console logs
- [ ] Final UI polish
- [ ] Record 2-3 min demo video
- [ ] Update README
- [ ] Tag v0.1.0 release
- [ ] Push to GitHub

### Add:
- [ ] Onboarding flow for new users
- [ ] Tooltips on complex features
- [ ] About/version info

**Owner:** All hands

---

## 🎯 End-of-Week Deliverables

| Deliverable | Status |
|-------------|--------|
| All packages building | ✅ |
| UI functional on mainnet | 🔜 |
| Detection validated | 🔜 |
| Trades executed successfully | 🔜 |
| Bots run stable | 🔜 |
| Volume patterns work | 🔜 |
| Security hardened | 🔜 |
| Docs complete | 🔜 |
| v0.1.0 tagged | 🔜 |

---

## 💰 Risk Budget for Week

| Day | Max Exposure | Purpose |
|-----|--------------|---------|
| Mon | $0 | Read-only |
| Tue | 0.5 SOL | Manual trades |
| Wed | 1 SOL | Bot testing |
| Thu | 2 SOL | Volume patterns |
| Fri | 0 | Security testing |
| Sat | 0 | Polish |
| **Total** | **~3.5 SOL** | Learning cost |

---

## 🚀 Post-Week Roadmap

### Week 2: Scale Up
- Larger position sizes
- Multiple concurrent bots
- More token coverage

### Week 3: Telegram Bot
- Command interface
- Alerts and notifications
- Remote control

### Week 4: Community
- Public release
- Documentation site
- Discord community

---

## 📞 Daily Check-in

Quick sync each day:
- ✅ What shipped?
- 🚧 What's blocked?
- 🎯 What's next?

Lewy ↔ General ↔ Nate via Telegram

---

*Mainnet or nothing. Let's get it.* 🎖️
