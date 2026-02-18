# Trade Recording

Every trade in TrenchTools is recorded in the transaction history. This history is the source of truth for P&L calculations.

## How Trades Are Recorded

When any component executes a swap (Sniper, Volume, Bot Groups, Quick Swap), it calls `addTrade()` from the `TxHistoryContext`:

```typescript
addTrade({
  type: 'buy',              // 'buy' | 'sell'
  tokenMint: 'CA...',       // Token contract address
  amount: 1000000,          // Token amount (raw)
  price: 0.00001,           // Price per token in SOL
  wallet: '7xKp...3mFq',   // Wallet address that made the trade
  txHash: '5abc...def',     // On-chain transaction signature
  status: 'success',        // 'success' | 'failed' | 'pending'
  source: 'sniper'          // 'sniper' | 'volume' | 'manual' | 'quick-swap'
})
```

## Trade Record Structure

```typescript
interface TradeRecord {
  id: string           // Unique ID (auto-generated)
  timestamp: number    // Unix timestamp
  type: 'buy' | 'sell'
  tokenMint: string    // Token CA
  amount: number       // Token amount
  price?: number       // Price in SOL
  wallet: string       // Wallet address
  txHash?: string      // TX signature
  status: 'success' | 'failed' | 'pending'
  source?: string      // Which feature initiated the trade
}
```

## Storage

- Stored in `localStorage` under `trench_tx_history`
- Maximum 500 records (oldest are dropped)
- New trades are prepended (newest first)

## P&L Derivation

The `PnLContext` subscribes to trade history changes and automatically recalculates:

1. **Entry price**: Weighted average of all buy trades for a token
2. **Current holdings**: Sum of buys minus sum of sells
3. **Unrealized P&L**: (current price - entry price) × holdings
4. **Realized P&L**: Accumulated profit/loss from completed sells

Current prices are refreshed every 30 seconds from the DexScreener API.

## Viewing Trade History

Trades appear in several places:
- **Dashboard**: Recent activity feed
- **Bot Groups**: Per-bot trade list (filtered by bot wallets + target token)
- **P&L Charts**: Aggregated into daily profit/loss
