# Token Charts

Real-time token price charts powered by Lightweight Charts, directly in your TrenchTools dashboard.

## Overview

The Charts tab lets you view live price data for any Solana token without leaving the dashboard. Enter a token CA and get an interactive candlestick chart with volume overlay.

## How to Use

1. Navigate to the **Charts** tab (chart icon in sidebar)
2. Paste a token contract address (CA)
3. View the price chart with candlesticks, volume bars, and time controls

## Chart Features

- **Candlestick view**: OHLC price data
- **Volume overlay**: Trade volume bars below the price chart
- **Time ranges**: Switch between different timeframes
- **Interactive**: Zoom, pan, and hover for price details
- **Auto-refresh**: Price data updates periodically

## Tech Stack

Built with [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) by TradingView — the same charting library used by many professional trading platforms. Fast, lightweight, and renders smoothly even on lower-end devices.

## Data Source

Price data is fetched from DexScreener and on-chain sources. The chart displays whatever trading pair data is available for the token across Solana DEXes.
