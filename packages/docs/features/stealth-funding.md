# Stealth Funding

Stealth Funding breaks on-chain wallet clustering by routing treasury-to-wallet transfers through [ChangeNow](https://changenow.io). Each sub-wallet gets funded from a completely unrelated on-chain source — invisible on Bubblemaps, Arkham, and other clustering tools.

## The Problem

When you fund sub-wallets directly from your treasury, blockchain analytics tools trivially link them:

```
Treasury ──SOL──→ SubWallet-1
Treasury ──SOL──→ SubWallet-2
Treasury ──SOL──→ SubWallet-3
```

Bubblemaps and Arkham will show all wallets as a single cluster — defeating the purpose of multi-wallet strategies.

## How Stealth Funding Works

With stealth enabled, each transfer is routed through a USDC intermediate swap and a ChangeNow exchange:

```
Treasury ──Jupiter──→ USDC (one batch swap for total amount)
  └─ USDC → ChangeNow deposit #1 (usdcsol→sol) → SOL → SubWallet-1
  └─ USDC → ChangeNow deposit #2 (usdcsol→sol) → SOL → SubWallet-2
```

Each wallet receives SOL from ChangeNow's hot wallet. No link to your treasury.

### Flow Per Wallet

1. **Jupiter Swap** — one batch SOL→USDC swap on the treasury for the total amount needed
2. **Split USDC** — proportionally allocated to each destination
3. **Create Exchange** — ChangeNow generates a unique USDC deposit address per wallet
4. **Send USDC Deposit** — USDC transferred from treasury ATA to each deposit address
5. **Exchange** — ChangeNow converts USDC→SOL and sends to the sub-wallet (~2-10 min)

## Setup

1. Get a free API key at [changenow.io/affiliate](https://changenow.io/affiliate) (instant, self-service)
2. Go to **Settings** in the dashboard
3. Enter your **ChangeNow API Key**
4. Toggle **Stealth Funding** to ON

## Where Stealth Applies

| Operation | Stealth Available |
|-----------|:-:|
| Fund sub-wallet from treasury | Yes |
| Bulk Fund sub-wallets | Yes |
| Bot Groups wallet funding | Yes |
| Sweep SOL back to treasury | No |
| Inter-wallet transfers | No |
| Buy/sell swaps | No |

Stealth funding only applies to treasury → sub-wallet transfers. Sweeps, swaps, and inter-wallet moves are not affected (they don't need to be — the clustering link is already broken).

## Trade-offs

| | Direct Transfer | Stealth (ChangeNow) |
|---|---|---|
| **Speed** | ~2 seconds | ~2-10 minutes |
| **Cost** | ~0.000005 SOL (tx fee) | ~0.55% fee (Jupiter + ChangeNow) |
| **Privacy** | Fully traceable | Untraceable |
| **Reliability** | 99.9%+ | Depends on ChangeNow availability |
| **Fallback** | N/A | Auto-falls back to direct transfer on failure |

::: warning Timing
Each wallet takes **~2-10 minutes** to receive SOL through ChangeNow. When funding 5 wallets with stealth, expect the full process to complete in 2-10 minutes (wallets are processed concurrently, up to 5 at a time).
:::

## Batch Funding

When funding multiple wallets (Bulk Fund, Bot Groups), stealth processes up to **5 wallets concurrently**. The Jupiter SOL→USDC swap is done once for the total amount, then USDC is split across parallel ChangeNow exchanges — different deposit addresses, different timing.

Progress is shown in real-time with per-wallet status (queued, exchanging, sending, finished).

## Failure Handling

If a stealth exchange fails (timeout, ChangeNow downtime, etc.):

1. The failed wallet is reported with the error
2. Successfully stealthed wallets remain untraceable
3. Failed wallets can be retried or funded directly

::: warning
Fallback to direct transfer means that specific wallet WILL be linked to your treasury on-chain. If full stealth is critical, monitor the progress and retry failed wallets manually.
:::

## Limits

ChangeNow has per-exchange min/max amounts. The estimate endpoint returns current limits. If your amount is outside the range, the exchange will be rejected.
