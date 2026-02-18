# Activity Generator

The Activity Generator creates transaction history to make wallets appear more active and established.

## Purpose

Fresh wallets with zero transaction history can be flagged by on-chain analysis tools. The Activity Generator adds legitimate-looking transaction history to your wallets before using them for trading operations.

## Transaction Types

- **SOL Transfers**: Small SOL transfers between your own wallets
- **SPL Transfers**: Token transfers (if tokens are held)
- **Swaps**: Small swap transactions through DEXes

## Configuration

| Setting | Description |
|---------|-------------|
| **Wallet Count** | How many wallets to generate activity for |
| **TX Count** | Number of transactions per wallet |
| **SOL Range** | Min/max SOL amount per transaction |
| **Time Range** | Spread transactions over this time period |

## How It Works

1. Select which wallets should receive activity
2. Configure the number and type of transactions
3. Click **Generate**
4. The system executes small, randomized transactions
5. Each transaction is a real on-chain operation

::: warning
Activity generation uses real SOL for transaction fees. Plan your budget accordingly — even small transactions cost ~0.000005 SOL each.
:::

## Best Practices

- Generate activity **before** using wallets for volume or sniping
- Use small, varied amounts to look natural
- Spread transactions over time rather than doing them all at once
- Mix transaction types (transfers + small swaps)
