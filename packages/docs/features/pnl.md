# P&L Analytics

Real-time profit and loss tracking across all your wallets and positions.

## How P&L Is Calculated

### Data Flow
```
Trade executed → addTrade() → TxHistoryContext → PnLContext recalculates
```

1. Every trade (buy/sell) is recorded in `TxHistoryContext`
2. `PnLContext` subscribes to trade history changes
3. Positions are derived by aggregating all trades per token
4. Current prices are fetched from DexScreener every 30 seconds

### Per-Token Position

For each token you've traded:

| Metric | Calculation |
|--------|-------------|
| **Entry Price** | Weighted average of all buy prices |
| **Current Holdings** | Sum of buys - sum of sells (in tokens) |
| **Current Price** | Latest from DexScreener API |
| **Unrealized P&L** | (current price - entry price) × holdings |
| **Realized P&L** | Sum of (sell price - entry price) × sell amounts |
| **Total P&L** | Unrealized + Realized |

### Persistence
- Trade history: `trench_tx_history` (localStorage, max 500 records)
- P&L data: `trench_pnl_data` (localStorage, auto-recalculated)

## P&L Charts

The P&L page displays:
- **Daily P&L**: Bar chart showing profit/loss per day
- **Cumulative P&L**: Line chart showing total P&L over time
- **Position cards**: Per-token breakdown with entry, current, and P&L

Built with [Recharts](https://recharts.org/) for the charts and DexScreener for price data.

## Price Feeds

Current prices are fetched from the DexScreener API:
```
https://api.dexscreener.com/latest/dex/tokens/{tokenMint}
```

- Refreshes every 30 seconds while the P&L page is active
- Falls back gracefully if the API is unreachable
- Supports any Solana token listed on DexScreener
