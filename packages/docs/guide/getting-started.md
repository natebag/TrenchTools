# Getting Started

## Choose Your Setup

### Option 1: Hosted (Zero Setup)

Use the hosted version — no installation, no API keys, no configuration.

1. Go to [app.trenchtools.io](https://app.trenchtools.io)
2. Sign in with **Phantom wallet** or create an account with **email/password**
3. Create your wallet vault password
4. Generate wallets and start trading

The hosted version provides managed RPC, Jupiter API, and Helius priority fees. A 0.5% fee per swap covers infrastructure costs. Your keys are encrypted in your browser and never sent to the server.

---

### Option 2: Self-Hosted (Free)

Run TrenchTools locally on your machine. No fees, no accounts, full control.

#### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- A Solana RPC endpoint (Helius, QuickNode, or public RPC)
- A Jupiter API key (optional, for higher rate limits)

#### Installation

```bash
# Clone the repository
git clone https://github.com/natebag/Trenchtools.git
cd Trenchtools

# Install dependencies
pnpm install

# Start the UI dev server
pnpm start
```

The dashboard will open at `http://localhost:5173`.

---

## First-Time Setup

These steps apply to both hosted and self-hosted.

### 1. Configure Your RPC (Self-Hosted Only)

Navigate to **Settings** (gear icon in sidebar) and enter your Solana RPC URL. The default public RPC works but has rate limits. For production use, get a dedicated endpoint from:

- [Helius](https://helius.dev/) (recommended — also enables smart priority fees)
- [QuickNode](https://quicknode.com/)
- [Alchemy](https://alchemy.com/)

::: tip
Hosted users skip this step — a managed RPC is provided automatically.
:::

### 2. Set Your Network

Click the network badge in the header to toggle between **Devnet** and **Mainnet**.

::: warning
Start on **Devnet** to test all features with free SOL before using real funds on Mainnet.
:::

### 3. Create Your Wallet Vault

Navigate to **Wallets** and create a new vault password. This password encrypts all your private keys in the browser using Web Crypto API + Argon2.

::: danger
If you lose your vault password, your keys are unrecoverable. Back up your wallets using the export feature.
:::

### 4. Generate Wallets

In the Wallets page:
1. Click **Add Sub-Wallet**
2. Choose a wallet type: **Treasury**, **Sniper**, or **Burner**
3. Name your wallet
4. Click **Generate**

You'll need at least:
- 1 **Treasury** wallet (holds your main SOL)
- 1+ **Sniper** wallets (for sniping tokens)

### 5. Fund Your Treasury

Send SOL to your treasury wallet address from any external wallet (Phantom, Solflare, etc.). On devnet, use the [Solana Faucet](https://faucet.solana.com/).

## Quick Test: Snipe a Token

1. Go to the **Sniper** tab
2. Paste a token CA (contract address)
3. Set your buy amount in SOL
4. Configure slippage (default 10% is fine for most tokens)
5. Click **Snipe**

TrenchTools will auto-detect whether the token is on PumpFun or Jupiter and route the trade accordingly.

## Build for Production

```bash
# Build all packages
pnpm build

# Or build just the UI
npx turbo run build --filter=@trenchtools/ui --force
```

The production build outputs to `packages/ui/dist/` — a static site you can host anywhere.

## Project Structure

```
TrenchTools/
├── packages/
│   ├── core/          # TypeScript library (wallet, trading, P&L, shield)
│   ├── ui/            # React dashboard (the main app)
│   ├── docs/          # This documentation site
│   └── landing/       # Landing page (trenchtools.io)
├── package.json       # Workspace root
├── pnpm-workspace.yaml
└── turbo.json
```
