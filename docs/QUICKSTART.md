# TrenchSniper OS — Quick Start

Get up and running in 10 minutes.

---

## Prerequisites

- [ ] Node.js 18+
- [ ] pnpm (`npm i -g pnpm`)
- [ ] SOL in a wallet you control
- [ ] Jupiter API key from [portal.jup.ag](https://portal.jup.ag)

---

## 1. Clone & Install

```bash
git clone https://github.com/natebag/TrenchSniper-OS.git
cd TrenchSniper-OS
pnpm install
```

## 2. Start the App

```bash
pnpm dev
```

Open **http://localhost:3001**

## 3. Create Your Vault

1. Go to **Wallets** page
2. Click **Create Vault**
3. Enter a strong password (12+ chars)
4. Your Treasury wallet is auto-generated

## 4. Generate Sub-Wallets

1. Click **Add Wallet**
2. Enter name (e.g., "Trader1")
3. Click Generate
4. Repeat 5-10 times

## 5. Fund Your Treasury

1. Copy Treasury address
2. Send SOL from your external wallet
3. Wait for balance to update (click refresh)

## 6. Distribute to Sub-Wallets

1. Click **Fund Sub-Wallets**
2. SOL distributes evenly to all sub-wallets
3. Each keeps 0.005 SOL for rent

## 7. Start Volume Boosting

1. Go to **Volume** page
2. Paste your **Jupiter API Key**
3. Toggle **Real Trades** ON
4. Enter your **Token Mint Address**
5. Set intensity to **Low** (to start)
6. Click **Start Boosting**

## 8. Monitor

- Watch the transaction log
- Check success rate (aim for >95%)
- View your trades on [Solscan](https://solscan.io)

---

## Quick Commands

```bash
# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

---

## Common Token Mints

| Token | Mint Address |
|-------|--------------|
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |
| WIF | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

---

## Need Help?

- Full docs: [MAINNET_DEPLOYMENT.md](./MAINNET_DEPLOYMENT.md)
- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- GitHub Issues: [natebag/TrenchSniper-OS](https://github.com/natebag/TrenchSniper-OS/issues)
