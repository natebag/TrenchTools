# TrenchSniper OS - UI

The web-based control panel for TrenchSniper OS.

## Features

- 🎯 **Sniper Control** - Configure and run token sniping
- 📊 **Volume Boosting** - Market making with Jupiter integration
- 💰 **Treasury Management** - HD wallet management with fund/sweep
- 🔍 **Detection Dashboard** - Manipulation analysis with DexScreener
- 📈 **Charts** - Live charts with buy/sell markers
- 🛡️ **Shield Scanner** - Token security analysis

## Quick Start

```bash
# From monorepo root
pnpm install
pnpm dev

# Or from this package
cd packages/ui
pnpm dev
```

The UI will be available at `http://localhost:3000` (or next available port).

## Configuration

### Environment Variables

Create a `.env` file:

```env
# Optional: Override RPC endpoint
VITE_RPC_URL=https://solana-rpc.publicnode.com
```

### Jupiter API Key

For volume boosting with real trades, enter your Jupiter API key in the Volume Control settings. Get one free at [portal.jup.ag](https://portal.jup.ag).

## Deploy

### Vercel

1. Connect your repo to Vercel
2. Set root directory to `packages/ui`
3. Deploy!

Or use the CLI:

```bash
cd packages/ui
npx vercel
```

### Manual Build

```bash
pnpm build
# Output in dist/
```

## Tech Stack

- React 18 + TypeScript
- Vite
- TailwindCSS
- @solana/web3.js
- lightweight-charts (TradingView)
- Lucide icons

## Project Structure

```
src/
├── components/     # UI components
├── context/        # React contexts (Wallet, Network, etc.)
├── hooks/          # Custom hooks
├── lib/            # Utilities
└── App.tsx         # Main app
```

## Key Files

- `TreasuryWalletManager.tsx` - Wallet management UI
- `VolumeControl.tsx` - Volume boosting engine
- `DetectionDashboard.tsx` - Manipulation detection
- `TokenChart.tsx` - Charts with trade markers
- `useSecureWallet.ts` - Encrypted wallet vault hook

## Security

- Private keys are encrypted with AES-256-GCM in browser localStorage
- Keys never leave the browser
- Transactions are signed client-side

## License

MIT
