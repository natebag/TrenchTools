# Configuration

## Settings Panel

Access settings via the gear icon in the sidebar. All settings are persisted in `localStorage`.

### RPC Endpoint

Your Solana RPC URL. This is used for all on-chain operations: balance checks, transaction sending, account queries.

```
https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

::: tip
Use a dedicated RPC for production. Public endpoints have aggressive rate limits that will cause transaction failures during market making.
:::

### Jupiter API Key

Optional. Provides higher rate limits on the Jupiter Quote API. Get one at [station.jup.ag](https://station.jup.ag/).

Without a key, you'll use the public endpoint which works fine for occasional trading but may throttle during heavy volume operations.

::: tip
Hosted users don't need this — the managed Jupiter API key is provided automatically.
:::

### Helius API Key (Optional)

For smart priority fee estimation based on real-time network congestion, add your Helius API key in Settings. This uses Helius's `getPriorityFeeEstimate` to automatically set optimal priority fees for each transaction.

Get one at [helius.dev](https://helius.dev/) (free tier available).

Without it, Jupiter's built-in `auto` priority fee is used instead, which works fine for most operations.

### Network Selection

Toggle between **Mainnet** and **Devnet** via the badge in the header bar. This affects:
- Which RPC endpoint is used
- Which token addresses are valid
- Whether real SOL is at risk

### Priority Fees & Jito Tips

Configure transaction priority:
- **Priority Fee**: Extra lamports per compute unit (helps with congestion)
- **Jito Tip**: MEV protection tip sent to Jito validators

## Data Persistence

All data is stored in browser `localStorage`:

| Key | Contents |
|-----|----------|
| `trenchsniper_secure_wallets` | Encrypted wallet vault |
| `trench_tx_history` | Trade records (max 500) |
| `trench_pnl_data` | P&L positions |
| `trench_bot_configs` | Bot group configurations |
| `trench_settings_v1` | User settings |
| `trench_config_v1` | Sniper/trading config |

::: warning
Clearing your browser data will delete your encrypted wallet vault. Always export a backup before clearing site data.
:::

## Environment Variables

The UI package supports these environment variables via Vite:

```env
VITE_DEFAULT_RPC_URL=https://api.mainnet-beta.solana.com
VITE_JUPITER_API_KEY=your-key-here
```

Create a `.env` file in `packages/ui/` to set defaults.
