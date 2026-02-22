# Self-Hosting Guide

By default, `trenchsniper-mcp` connects to TrenchTools hosted infrastructure. If you want to run fully self-hosted with your own RPC and API keys, follow this guide.

## Setup

Set `TRENCH_SELF_HOSTED=true` and provide your own RPC endpoint:

```json
{
  "mcpServers": {
    "trenchsniper": {
      "command": "npx",
      "args": ["-y", "trenchsniper-mcp"],
      "env": {
        "TRENCH_SELF_HOSTED": "true",
        "TRENCH_RPC_URL": "https://your-rpc-endpoint.com",
        "TRENCH_VAULT_PASSWORD": "your-secure-password",
        "TRENCH_JUPITER_API_KEY": "your-jupiter-key",
        "TRENCH_HELIUS_API_KEY": "your-helius-key"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRENCH_SELF_HOSTED` | Yes | `false` | Set to `true` to enable self-hosted mode |
| `TRENCH_RPC_URL` | Yes | - | Your Solana RPC endpoint |
| `TRENCH_VAULT_PASSWORD` | Yes | - | Wallet vault encryption password (min 8 chars) |
| `TRENCH_JUPITER_API_KEY` | No | - | Jupiter API key for higher rate limits |
| `TRENCH_HELIUS_API_KEY` | No | - | Helius API key for priority fee estimation |
| `TRENCH_CHANGENOW_API_KEY` | No | - | ChangeNow API key (required for stealth funding) |
| `TRENCH_VAULT_PATH` | No | `~/.trenchsniper/vault.json` | Wallet vault file location |
| `TRENCH_SLIPPAGE_BPS` | No | `500` | Default slippage (500 = 5%) |
| `TRENCH_MAX_BUY_SOL` | No | `1.0` | Safety cap per buy order |

## What Changes in Self-Hosted Mode

- Swaps go directly to Jupiter API and PumpPortal (not proxied through TrenchTools)
- No fees are collected
- You need your own RPC endpoint (public RPC has strict rate limits)
- Jupiter API key is recommended for production use
- Helius API key enables priority fee estimation
- Stealth funding requires your own ChangeNow API key

## RPC Recommendations

The public Solana RPC (`api.mainnet-beta.solana.com`) has strict rate limits. For trading, use a dedicated provider:

- [Helius](https://helius.dev) — Free tier available
- [QuickNode](https://quicknode.com) — Free tier available
- [Alchemy](https://alchemy.com) — Free tier available
