# Volume Boosting

The Volume Booster generates real on-chain trading volume across multiple wallets with configurable patterns designed to look organic.

## How It Works

1. Navigate to **Market Making** → **Manual Volume** tab
2. Enter the token CA
3. Select wallets to use (multi-select from your sniper/treasury wallets)
4. Configure the pattern and intensity
5. Click **Start**

The engine cycles through your selected wallets, executing real buy/sell swaps at randomized intervals.

## Volume Patterns

| Pattern | Description | Best For |
|---------|-------------|----------|
| **Organic** | Randomized intervals and amounts with natural-looking variance | General volume boosting |
| **Steady** | Consistent intervals with small random jitter | Maintaining baseline volume |
| **Burst** | Rapid trades in clusters with quiet periods between | Simulating momentum |
| **Wave** | Volume ramps up and down in sine-wave cycles | Extended campaigns |

## Intensity Levels

| Intensity | Min Interval | Max Interval | Trade Range |
|-----------|-------------|-------------|-------------|
| **Low** | 30s | 120s | Small amounts |
| **Medium** | 15s | 60s | Moderate amounts |
| **High** | 5s | 30s | Larger amounts |
| **Aggressive** | 2s | 10s | Maximum amounts |

## Trade Engine

The volume engine:
1. Picks the next wallet in round-robin order
2. Checks wallet SOL balance
3. Alternates between buy and sell (buy-first enforcement)
4. Auto-detects DEX (PumpFun vs Jupiter)
5. Executes the swap with randomized amount within configured range
6. Records the trade via `addTrade()`
7. Schedules next trade after random interval
8. Repeats until stopped

## Advanced Configuration

- **Min/Max Swap SOL**: Override the intensity preset with custom amounts
- **Min/Max Interval (ms)**: Override timing with custom intervals
- **Slippage**: Per-trade slippage tolerance
- **Priority Fee**: Transaction priority for congested networks

## Live Stats

While running, the panel shows:
- Total swaps executed
- Total volume in SOL
- Current wallet being used
- Time elapsed
- Swaps per minute

## Visibility Handling

The trade loop pauses when the browser tab is hidden (to prevent setTimeout drift) and resumes when the tab becomes visible again.
