# TrenchSniper OS — Mainnet Deployment Guide

Complete guide to deploying TrenchSniper OS for mainnet trading.

---

## 📋 Pre-Launch Checklist

### 1. Infrastructure Setup

- [ ] **RPC Provider** — Get a reliable paid RPC (free ones rate-limit hard)
  - [Helius](https://helius.dev) — Best for Solana, free tier decent
  - [QuickNode](https://quicknode.com) — Reliable, paid
  - [Triton](https://triton.one) — Good for high-volume
  - Backup: `https://solana-rpc.publicnode.com` (CORS-friendly, free)

- [ ] **Jupiter API Key** — Required for swaps
  - Go to [portal.jup.ag](https://portal.jup.ag)
  - Create account, generate API key
  - Free tier: 600 requests/min (enough for moderate volume)

- [ ] **Domain + Hosting**
  - Vercel (free tier works)
  - Or self-host on VPS

### 2. Wallet Setup

- [ ] **Treasury Wallet** — Main funding wallet
  - Generate fresh or import existing
  - This holds the SOL you'll distribute

- [ ] **Sub-Wallets** — Trading wallets (5-20 recommended)
  - Generate in-app
  - More wallets = more organic-looking distribution

- [ ] **Initial Funding**
  - Treasury: Load with SOL for trading + gas
  - Recommended minimum: **1-5 SOL** for testing
  - Production: depends on daily volume target

### 3. Security Review

- [ ] **Vault Password** — Use strong password (12+ chars)
- [ ] **Browser Security** — Don't use on shared/public computers
- [ ] **Backup Keys** — Export and secure private keys offline
- [ ] **Test on Devnet First** — Always test new tokens on devnet

---

## 🚀 Deployment Steps

### Step 1: Deploy the UI

**Option A: Vercel (Recommended)**
```bash
cd packages/ui
npx vercel
```
- Connect GitHub repo
- Set root directory: `packages/ui`
- Deploy

**Option B: Self-Host**
```bash
pnpm build
# Serve dist/ folder with nginx/caddy
```

**Option C: Local Only**
```bash
pnpm dev
# Access at localhost:3001
```

### Step 2: Configure Environment

Create `.env` in `packages/ui/`:
```env
# Optional: Override default RPC
VITE_RPC_URL=https://your-rpc-endpoint.com
```

Or configure in-app via Settings page.

### Step 3: First-Time Setup

1. **Open the app** → Go to `/wallets`
2. **Create Vault** → Set a strong password
3. **Generate Sub-Wallets** → Create 5-10 trading wallets
4. **Fund Treasury** → Send SOL to Treasury address
5. **Distribute** → Click "Fund Sub-Wallets" to spread SOL

### Step 4: Configure Volume Boosting

1. Go to `/volume`
2. Enter **Jupiter API Key**
3. Toggle **Real Trades** ON
4. Enter **Target Token Mint** address
5. Set **Intensity** (start with "low")
6. Set **Pattern** ("organic" recommended)
7. Select which wallets to use
8. Click **Start Boosting**

---

## 💰 Funding Calculator

| Daily Volume Target | Min Treasury | Wallets | Intensity |
|---------------------|--------------|---------|-----------|
| 10 SOL/day | 2 SOL | 5 | Low |
| 50 SOL/day | 10 SOL | 10 | Medium |
| 200 SOL/day | 40 SOL | 20 | High |
| 500+ SOL/day | 100+ SOL | 50+ | Aggressive |

**Note:** Each swap costs ~0.000005 SOL in fees + slippage. Budget 1-2% overhead.

---

## 🔐 Security Best Practices

### DO:
- ✅ Use unique password for vault
- ✅ Test with small amounts first
- ✅ Monitor transactions on Solscan
- ✅ Keep backup of private keys offline
- ✅ Use intensity "low" or "medium" to avoid detection
- ✅ Vary trading patterns (use "organic" mode)

### DON'T:
- ❌ Share vault password
- ❌ Use on public WiFi without VPN
- ❌ Fund more than you can afford to lose
- ❌ Use "aggressive" mode on low-liquidity tokens
- ❌ Run 24/7 without monitoring

---

## 📊 Monitoring Checklist

While running, monitor:

1. **In-App Dashboard**
   - Success rate (should be >95%)
   - SOL balance depletion rate
   - Transaction logs

2. **External Tools**
   - [Solscan](https://solscan.io) — Watch wallet activity
   - [DexScreener](https://dexscreener.com) — Watch volume impact
   - [Birdeye](https://birdeye.so) — Token analytics

3. **Alerts to Watch**
   - Repeated failed transactions
   - Balance draining faster than expected
   - Token price crashing (might want to stop)

---

## 🛠️ Troubleshooting

### "Quote failed" errors
- Token might have low liquidity
- Try increasing slippage in advanced settings
- Check if token is tradeable on Jupiter

### "Transaction failed" errors
- Insufficient SOL for gas
- RPC rate limited — switch provider
- Network congestion — retry

### "Wallet locked" errors
- Refresh page and unlock vault again
- Check password is correct

### Volume not showing on DexScreener
- Wait 5-10 minutes for indexing
- Confirm transactions succeeded on Solscan
- Check you're trading the right pair

---

## 📈 Scaling Up

### Phase 1: Testing (1-2 days)
- 0.5-1 SOL budget
- 5 wallets
- Low intensity
- Monitor everything

### Phase 2: Soft Launch (1 week)
- 5-10 SOL budget
- 10 wallets
- Medium intensity
- Track daily volume generated

### Phase 3: Production
- Scale based on Phase 2 results
- Add more wallets as needed
- Consider multiple instances for redundancy

---

## 🔄 Maintenance

### Daily
- Check transaction success rate
- Top up Treasury if low
- Review any failed transactions

### Weekly
- Rotate wallets (generate new, retire old)
- Review detection dashboard for your token
- Check for app updates

### Monthly
- Full security review
- Backup vault/keys
- Assess ROI and adjust strategy

---

## 📞 Support

- **GitHub Issues:** [natebag/TrenchSniper-OS](https://github.com/natebag/TrenchSniper-OS/issues)
- **Discord:** (coming soon)

---

## ⚠️ Disclaimer

This software is for educational purposes. Market making and volume generation may be subject to regulations in your jurisdiction. Use at your own risk. Never trade with funds you can't afford to lose.

---

*Last updated: February 2026*
