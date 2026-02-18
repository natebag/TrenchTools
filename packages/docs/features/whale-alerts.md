# Whale Alerts

Monitor large wallet movements and whale activity on tokens you're tracking.

## Overview

The Whale Alerts feature watches for significant transactions on tokens in your active token list. When a large trade is detected, you get a real-time alert in the dashboard.

## Alert Types

- **Large Buy**: A whale wallet buys a significant amount of a tracked token
- **Large Sell**: A whale wallet dumps tokens
- **Large Transfer**: Significant token movement between wallets

## Configuration

Whale alerts are configured in the Whale Alerts tab:
- Set minimum SOL threshold for alerts
- Choose which tokens to monitor
- Enable/disable notification types

## How It Works

The `WhaleContext` provider monitors on-chain activity using WebSocket subscriptions to your RPC endpoint. When a transaction exceeds the configured threshold for a tracked token, it creates an alert entry.

::: info
Whale alert quality depends on your RPC endpoint. WebSocket connections may be limited on public RPCs.
:::
