# Activity Generator Guide

The Activity Generator creates real on-chain Solana transaction history for your wallets. This is commonly called **wallet aging** — building a genuine footprint of swaps and transfers so wallets don't appear freshly created.

---

## Why Age Wallets?

| Fresh Wallet Signals | Aged Wallet Signals |
|----------------------|---------------------|
| Zero transaction history | Months of real trades |
| No token interactions | Diverse token swaps |
| Immediately suspicious | Appears organic |
| Flagged by detection tools | Passes basic analysis |

Wallet aging helps your sub-wallets look like real traders before using them for sniping or market making.

> **Note:** Activity generation uses real SOL for real transactions. Start with small amounts on low intensity to test.

---

## How It Works

The Activity Generator runs **parallel trade loops** — one per selected wallet. Each wallet independently:

1. **Picks a random action** — token swap or SOL transfer (based on enabled types)
2. **Executes on-chain** — real Jupiter swaps or native SOL transfers
3. **Waits a random interval** — based on intensity settings
4. **Repeats** until the configured duration expires

When generation stops (manually or on timer), all purchased tokens are **automatically sold back to SOL** via Jupiter.

---

## Transaction Types

### Token Swaps (Jupiter)

Swaps SOL to/from popular tokens via Jupiter aggregator. The generator naturally alternates between buying and selling:

- **Buy:** Picks a random enabled token, swaps SOL → Token
- **Sell:** If the wallet holds tokens from previous buys, 50% chance to sell one back to SOL

This creates a realistic pattern of buying and selling different tokens.

### SOL Transfers

Sends SOL between your selected wallets. Requires 2+ wallets selected. Creates transfer history that looks like normal wallet-to-wallet activity.

### NFT Interactions / DeFi (Coming Soon)

These transaction types are planned but not yet implemented. They appear in the UI with a "Soon" badge and cannot be enabled.

---

## Configuration

### Wallet Selection

Select which sub-wallets participate in activity generation. Only **sniper** and **treasury** type wallets are shown (burner wallets are filtered out).

- **Select All** — Enable all available wallets
- **Individual toggle** — Pick specific wallets

### Duration

| Preset | Description |
|--------|-------------|
| **1 Hour** | Quick aging session |
| **6 Hours** | Medium session |
| **24 Hours** | Full day of activity |
| **Custom** | Set your own duration in hours |

### Intensity

Controls trade frequency and size:

| Intensity | Trade Size | Interval | Description |
|-----------|-----------|----------|-------------|
| **Low** | 0.001 – 0.01 SOL | 5 – 15 min | Subtle, low-cost activity |
| **Medium** | 0.005 – 0.05 SOL | 1 – 5 min | Moderate activity |
| **High** | 0.01 – 0.1 SOL | 15 – 60 sec | Aggressive activity |

### Target Tokens

Choose which tokens the generator swaps with:

**Default tokens:** USDC, USDT, BONK, JUP, WIF, RAY

- **Toggle chips** — Enable/disable individual tokens
- **Add custom token** — Enter any SPL token mint address + symbol
- **Remove** — Delete custom tokens (default tokens can only be toggled)

All token selections are saved to localStorage and persist across sessions.

### Advanced Settings

Fine-tune the exact parameters:

| Setting | Description |
|---------|-------------|
| **Min/Max Transaction Size** | SOL amount range per trade |
| **Min/Max Interval** | Seconds between trades per wallet |

---

## Running the Generator

### Prerequisites

1. **Vault unlocked** — Unlock on the Wallets page first
2. **Wallets funded** — Selected wallets need SOL for trades + fees
3. **At least one type enabled** — Swaps and/or transfers must be toggled on
4. **Jupiter API key** (optional) — Set in Settings for better swap routing

### Starting

1. Select wallets
2. Configure duration, intensity, and target tokens
3. Click **Start Generation**
4. Each wallet starts its loop with a staggered delay (2–8 seconds apart)

### Monitoring

While running:
- **Progress bar** — Shows elapsed percentage of total duration
- **Transaction log** — Real-time list of pending/success/failed transactions
- **Stats** — Success count, failure count, total transactions
- **Solscan links** — Click any successful transaction to view on Solscan

### Stopping

Click **Stop Generation** to halt all wallet loops immediately. The generator then:

1. Cancels all pending trade loops
2. **Sells all token holdings back to SOL** via Jupiter
3. Shows a "Selling Holdings..." indicator while sells execute
4. Logs a summary of sold tokens and any errors

This sell-back also happens automatically when the timer expires.

### Background Tab Behavior

The generator is **always-mounted** — navigating to other pages (Wallets, Sniper, etc.) does not interrupt it. If you switch browser tabs and come back, stale wallet loops are automatically restarted.

---

## Cost Estimation

The UI shows an estimated cost before you start:

- **Swaps:** ~2% slippage + tx fee (~0.000005 SOL) per trade
- **Transfers:** Only tx fee (~0.000005 SOL) per trade
- **Total estimate** = (avg cost per tx) × (estimated tx count)

Actual costs may vary based on market conditions and slippage.

---

## Tips

- **Start with Low intensity** to verify everything works before running longer sessions
- **Use 3–5 wallets** for a good balance of diversity and cost
- **Mix swaps + transfers** for the most organic-looking history
- **Add custom tokens** relevant to your niche (e.g., meme coins you plan to trade)
- **Check the log** for repeated failures — usually means insufficient balance or RPC issues
- **Don't run during high congestion** — transaction fees spike and failure rates increase

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Wallet Vault Locked" | Go to Wallets page, enter your password to unlock |
| Start button disabled | Ensure wallets are selected, at least one type is enabled, and vault is unlocked |
| High failure rate | Check wallet SOL balances, verify RPC endpoint in Settings |
| Swaps failing | Ensure Jupiter API key is set in Settings (optional but recommended) |
| Tokens not selling back | Check the transaction log for specific errors; may need more SOL for fees |
| Progress stuck | Switch tabs and come back — the visibility resume handler will restart stale loops |
