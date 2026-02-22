# trenchsniper-mcp

MCP (Model Context Protocol) server for TrenchSniper — let AI agents trade on Solana.

Works with Claude Desktop, Cursor, VS Code, Cline, Windsurf, and any MCP-compatible client.

## Quick Start

Add to your AI client config — just one env variable:

### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trenchsniper": {
      "command": "npx",
      "args": ["-y", "trenchsniper-mcp"],
      "env": {
        "TRENCH_VAULT_PASSWORD": "your-secure-password"
      }
    }
  }
}
```

### Cursor / VS Code

Same JSON format — paste into MCP settings.

That's it. The server connects to TrenchTools infrastructure automatically. No RPC URL, no API keys, no account needed. 0.5% fee per swap.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRENCH_VAULT_PASSWORD` | Yes | - | Wallet vault encryption password (min 8 chars) |
| `TRENCH_VAULT_PATH` | No | `~/.trenchsniper/vault.json` | Wallet vault file location |
| `TRENCH_SLIPPAGE_BPS` | No | `500` | Default slippage (500 = 5%) |
| `TRENCH_MAX_BUY_SOL` | No | `1.0` | Safety cap per buy order |

### Self-Hosting

To run fully self-hosted (your own RPC, no fees), see the [Self-Hosting Guide](./SELF_HOSTING.md).

## Tools (20)

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

### Automation

| Tool | Description |
|------|-------------|
| `trench_volume_start` | Start volume boosting on a token |
| `trench_volume_status` | Check volume session stats |
| `trench_volume_stop` | Stop volume boosting |
| `trench_bot_start` | Create bot group (generate wallets, fund, trade) |
| `trench_bot_status` | Check bot group status |
| `trench_bot_stop` | Stop bot group (sell, sweep, cleanup) |
| `trench_activity_start` | Generate organic wallet activity |
| `trench_activity_status` | Check activity session progress |
| `trench_activity_stop` | Stop activity generation |

### Stealth

| Tool | Description |
|------|-------------|
| `trench_stealth_fund` | Fund wallets via ChangeNow (breaks on-chain links) |

## Example Prompts

```
"List my wallets"
"Generate 5 new wallets"
"Is token So1234... safe to trade?"
"Buy 0.05 SOL of token abc123..."
"Sell all my holdings of token xyz..."
"Show my current positions"
"Boost volume on token abc123..."
"Create a bot group called alpha with 10 wallets"
"How are the bots doing?"
"Stop bot group alpha"
"Build activity on my wallets for 2 hours"
"Fund 3 wallets stealthily with 0.1 SOL each"
```

## How It Works

- **Auto-routing**: Automatically detects PumpFun bonding curve tokens vs graduated Jupiter tokens
- **Wallet vault**: AES-256-GCM encrypted wallet storage on disk
- **Safety cap**: Configurable max SOL per buy to prevent fat-finger errors
- **Shield scanning**: On-chain analysis of mint authority, freeze authority, liquidity, and honeypot risk

## License

MIT
