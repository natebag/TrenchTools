# trenchsniper-mcp

MCP (Model Context Protocol) server for TrenchSniper — let AI agents trade on Solana.

Works with Claude Desktop, Cursor, VS Code, Cline, Windsurf, and any MCP-compatible client.

## Quick Start

```bash
npx trenchsniper-mcp
```

## Setup

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trenchsniper": {
      "command": "npx",
      "args": ["-y", "trenchsniper-mcp"],
      "env": {
        "TRENCH_RPC_URL": "https://api.mainnet-beta.solana.com",
        "TRENCH_VAULT_PASSWORD": "your-secure-password"
      }
    }
  }
}
```

### Cursor / VS Code

Add to MCP settings:

```json
{
  "mcpServers": {
    "trenchsniper": {
      "command": "npx",
      "args": ["-y", "trenchsniper-mcp"],
      "env": {
        "TRENCH_RPC_URL": "https://api.mainnet-beta.solana.com",
        "TRENCH_VAULT_PASSWORD": "your-secure-password"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRENCH_RPC_URL` | Yes | - | Solana RPC endpoint |
| `TRENCH_VAULT_PASSWORD` | Yes | - | Wallet vault encryption password (min 8 chars) |
| `TRENCH_JUPITER_API_KEY` | No | - | Jupiter API key for higher rate limits |
| `TRENCH_HELIUS_API_KEY` | No | - | Helius API key for priority fee estimation |
| `TRENCH_VAULT_PATH` | No | `~/.trenchsniper/vault.json` | Wallet vault file location |
| `TRENCH_SLIPPAGE_BPS` | No | `500` | Default slippage (500 = 5%) |
| `TRENCH_MAX_BUY_SOL` | No | `1.0` | Safety cap per buy order |

## Tools (11)

### Trading

| Tool | Description |
|------|-------------|
| `trench_quote` | Get swap quote with auto-routing (PumpFun vs Jupiter) |
| `trench_buy` | Buy a token with SOL (capped at MAX_BUY_SOL) |
| `trench_sell` | Sell a token for SOL (omit amount = sell all) |

### Wallet Management

| Tool | Description |
|------|-------------|
| `trench_wallet_list` | List vault wallets with SOL balances |
| `trench_wallet_generate` | Generate new wallets (1-100) |
| `trench_wallet_fund` | Send SOL from one wallet to others |
| `trench_wallet_sweep` | Sweep all SOL to a single destination |

### Intelligence

| Tool | Description |
|------|-------------|
| `trench_token_info` | Price, market cap, volume from DexScreener |
| `trench_balances` | SOL + SPL token balances for a wallet |
| `trench_positions` | Token holdings with live prices |
| `trench_shield_scan` | Safety score (0-100) with risk flags |

## Example Prompts

```
"List my wallets"
"Generate 5 new wallets"
"Is token So1234... safe to trade?"
"Get a quote for 0.1 SOL of pump1234..."
"Buy 0.05 SOL of token abc123..."
"Sell all my holdings of token xyz..."
"Show my current positions"
"Sweep all SOL to my main wallet"
```

## How It Works

- **Auto-routing**: Automatically detects PumpFun bonding curve tokens vs graduated Jupiter tokens
- **Wallet vault**: AES-256-GCM encrypted wallet storage on disk (not browser localStorage)
- **Safety cap**: Configurable max SOL per buy to prevent fat-finger errors
- **Shield scanning**: On-chain analysis of mint authority, freeze authority, liquidity, and honeypot risk

## License

MIT
