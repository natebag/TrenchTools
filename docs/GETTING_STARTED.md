# Getting Started with TrenchSniper-OS

Welcome to TrenchSniper-OS! This guide will walk you through installation, setup, and your first steps with the platform.

## Prerequisites

Before installing TrenchSniper-OS, ensure you have the following:

### Required Software

| Software | Version | Description |
|----------|---------|-------------|
| **Node.js** | ≥ 20.0.0 | JavaScript runtime |
| **pnpm** | ≥ 9.0.0 | Fast, disk-efficient package manager |
| **Git** | Latest | Version control |

### Verify Installation

```bash
# Check Node.js version
node --version
# Should output: v20.x.x or higher

# Check pnpm version
pnpm --version
# Should output: 9.x.x or higher
```

### Installing Prerequisites

**Node.js:**
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Or download directly from https://nodejs.org/
```

**pnpm:**
```bash
# Using npm
npm install -g pnpm@9

# Or using corepack (Node.js 16.10+)
corepack enable
corepack prepare pnpm@latest --activate
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/natebag/TrenchSniper-OS.git
cd TrenchSniper-OS
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all packages across the monorepo workspace.

### 3. Build All Packages

```bash
pnpm build
```

### 4. Configure Your Environment

Copy the example configuration and customize it:

```bash
cp trench.example.yaml trench.yaml
```

Edit `trench.yaml` with your settings:

```yaml
# trench.yaml
rpc:
  mainnet: "https://your-helius-or-quicknode-endpoint.com"
  devnet: "https://api.devnet.solana.com"

wallets:
  main: "/path/to/your/keypair.json"
  snipe:
    - "/path/to/wallet1.json"
    - "/path/to/wallet2.json"

strategy: balanced  # aggressive | balanced | conservative
```

> ⚠️ **Security Note:** Never commit your `trench.yaml` or wallet keypair files to version control!

---

## First Run / Launching the UI

### Starting the Web UI

```bash
# Navigate to the UI package
cd packages/ui

# Start the development server
pnpm dev
```

The UI will be available at `http://localhost:5173`

[Screenshot: TrenchSniper-OS Dashboard showing the main navigation and overview stats]

### Using the CLI

For command-line access, use the CLI package:

```bash
# From the project root
pnpm cli --help

# Or run specific commands
pnpm cli snipe <TOKEN_MINT> --amount 0.1
pnpm cli wallet --generate 5
```

---

## Creating Your First Wallet Vault

TrenchSniper-OS uses encrypted wallet vaults to securely store your trading wallets.

### Via the UI

1. Navigate to **Wallet Manager** in the sidebar
2. Click **"Create New Vault"**
3. Set a strong password (minimum 8 characters)
4. Choose the number of wallets to generate

[Screenshot: Wallet Manager showing the Create Vault dialog]

### Via the CLI

```bash
# Generate 5 new wallets
pnpm cli wallet --generate 5

# Generate with HD derivation from a seed
pnpm cli wallet --generate 10 --derivation hd --seed "your mnemonic phrase here"
```

### Vault Security Features

- **AES-256-GCM encryption** for wallet data
- **Argon2id key derivation** (memory-hard, resistant to GPU attacks)
- **Per-vault encryption** - each vault uses unique salt and IV
- **No plaintext storage** - private keys never written unencrypted

---

## Connecting to Mainnet vs Devnet

### Configuration in `trench.yaml`

```yaml
rpc:
  # Production - use a premium RPC endpoint
  mainnet: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
  
  # Testing - use the public devnet endpoint
  devnet: "https://api.devnet.solana.com"
```

### Recommended RPC Providers

| Provider | Tier | Best For |
|----------|------|----------|
| **Helius** | Premium | High-frequency trading |
| **QuickNode** | Premium | Reliability and uptime |
| **Triton** | Premium | Low latency |
| **Public RPC** | Free | Testing only |

> ⚠️ **Important:** Public RPC endpoints have rate limits. For production trading, always use a premium RPC provider.

### Switching Networks in the UI

1. Go to **Settings** → **Network**
2. Select **Mainnet** or **Devnet**
3. The UI will reload with the new network context

[Screenshot: Settings panel showing network selection dropdown]

### Switching Networks in the CLI

```bash
# Mainnet (default)
pnpm cli snipe <TOKEN> --amount 0.1

# Devnet
pnpm cli snipe <TOKEN> --amount 0.1 --network devnet
```

---

## Project Structure

Understanding the codebase:

```
TrenchSniper-OS/
├── packages/
│   ├── core/          # Core trading modules & wallet management
│   ├── snipe/         # Sniping engine with Jito support
│   ├── cli/           # Command-line interface
│   ├── ui/            # Web dashboard (React + Vite)
│   └── bot-telegram/  # Telegram bot interface
├── docs/              # Documentation (you are here!)
├── trench.yaml        # Your configuration (create from example)
└── trench.example.yaml
```

---

## Next Steps

Now that you're set up, explore these guides:

- **[Bot Configuration](./BOT_CONFIGURATION.md)** - Set up market making bots
- **[Detection Guide](./DETECTION_GUIDE.md)** - Analyze tokens for manipulation
- **[Volume Patterns](./VOLUME_PATTERNS.md)** - Understand volume boosting strategies
- **[FAQ](./FAQ.md)** - Common questions and troubleshooting

---

## Getting Help

- **GitHub Issues:** Report bugs or request features
- **Documentation:** Check the `/docs` folder
- **Discord:** Join our community (link in README)

---

*TrenchSniper-OS - Democratize the trenches. Free the tools.* 🎯
