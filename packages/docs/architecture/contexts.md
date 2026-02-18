# Context Providers

The UI uses React Context for global state management. Contexts are nested in a specific order in `DashboardLayout.tsx`.

## Provider Tree

```
ErrorBoundary
└── NetworkProvider
    └── WalletProvider
        └── ActiveTokensProvider
            └── TxHistoryProvider
                └── PnLProvider
                    └── WhaleProvider
                        └── ToastProvider
                            └── AppContent
```

Order matters — each provider can depend on providers above it in the tree.

## NetworkContext

**Provides**: `network`, `rpcUrl`, `setNetwork`, `setRpcUrl`

Manages the active Solana network (mainnet/devnet) and RPC endpoint. All on-chain operations read `rpcUrl` from this context.

**Persistence**: `trench_settings_v1` in localStorage

## WalletContext

**Provides**: Wallet list, active wallet, balance refresh

Works alongside the `useSecureWallet` hook which wraps the `BrowserWalletManager` singleton. The context provides the shared wallet state; the hook provides mutation methods (generate, remove, unlock, lock).

**Persistence**: `trench_all_wallets`, `trench_active_wallet` in localStorage
**Encrypted vault**: `trenchsniper_secure_wallets` in localStorage

## ActiveTokensContext

**Provides**: `tokens`, `addToken`, `removeToken`

Tracks which tokens the user is actively monitoring. Components call `addToken()` when a new token is sniped or traded to add it to the watch list.

## TxHistoryContext

**Provides**: `trades`, `addTrade`

The **source of truth** for all trade records. Every swap across all features calls `addTrade()` to record the result.

```typescript
interface TradeRecord {
  id: string
  timestamp: number
  type: 'buy' | 'sell'
  tokenMint: string
  amount: number
  price?: number
  wallet: string
  txHash?: string
  status: 'success' | 'failed' | 'pending'
  source?: string  // 'sniper' | 'volume' | 'manual' | 'quick-swap'
}
```

**Persistence**: `trench_tx_history` in localStorage (max 500 records)

## PnLContext

**Provides**: `positions`, `totalPnL`, `refreshPrices`

Derives position data from `TxHistoryContext`. Auto-recalculates whenever trades change. Fetches current prices from DexScreener every 30 seconds.

**Persistence**: `trench_pnl_data` in localStorage

## WhaleContext

**Provides**: `alerts`, whale monitoring state

Monitors large transactions on tracked tokens via RPC WebSocket subscriptions.

## ToastProvider

**Provides**: `showToast`

Global toast notification system for success/error/warning messages across the app.
