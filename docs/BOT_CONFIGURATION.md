# Bot Configuration Guide

This guide explains how to configure and manage market making bots in TrenchSniper-OS.

## What Are Market Making Bots?

Market making bots are automated trading programs that:

- **Execute trades** at configurable intervals
- **Generate volume** for your tokens
- **Maintain liquidity** on bonding curves and AMM pools
- **Operate 24/7** without manual intervention

In TrenchSniper-OS, the **Orchestrator** manages multiple bots simultaneously, handling scheduling, state persistence, and RPC load balancing.

---

## Bot Settings Explained

### Volume Targets

Control how much volume your bots generate:

| Setting | Description | Example |
|---------|-------------|---------|
| `dailyTargetSol` | Target volume in SOL per day | 50 SOL |
| `maxTotalVolumeSol` | Hard cap on total volume | 100 SOL |
| `stopAfterSwaps` | Automatically stop after N swaps | 1000 |

```yaml
# Example configuration
dailyTargetSol: 50
maxTotalVolumeSol: 100
stopAfterSwaps: 1000
```

### Interval Ranges

Define timing between trades:

| Setting | Description | Range |
|---------|-------------|-------|
| `minIntervalMs` | Minimum delay between swaps | 5,000 - 300,000 ms |
| `maxIntervalMs` | Maximum delay between swaps | 30,000 - 600,000 ms |
| `maxSwapsPerHour` | Rate limit per hour | 10 - 120 |

```typescript
// Example: 30 seconds to 2 minutes between swaps
{
  minIntervalMs: 30000,   // 30 seconds
  maxIntervalMs: 120000,  // 2 minutes
  maxSwapsPerHour: 60     // ~1 per minute average
}
```

**Timing Presets:**

| Level | Min Interval | Max Interval | Character |
|-------|-------------|--------------|-----------|
| Low | 2 min | 5 min | Slow, subtle |
| Medium | 30 sec | 2 min | Balanced |
| High | 15 sec | 1 min | Active |
| Aggressive | 5 sec | 30 sec | High frequency |

### Slippage Tolerance

Protect against unfavorable price movements:

```typescript
{
  slippageBps: 100,  // 1% slippage tolerance
}
```

| Value | Percentage | Use Case |
|-------|------------|----------|
| 50 bps | 0.5% | Low volatility tokens |
| 100 bps | 1.0% | Standard trading |
| 300 bps | 3.0% | High volatility tokens |
| 500 bps | 5.0% | Very volatile/new tokens |

> ⚠️ Higher slippage = more likely to execute, but worse average price

### Priority Fees

Improve transaction landing during congestion:

```typescript
{
  priorityFee: 'auto',  // Automatic fee estimation
  // OR
  priorityFee: 10000,   // Fixed 10,000 lamports (0.00001 SOL)
}
```

| Setting | Behavior |
|---------|----------|
| `'auto'` | Dynamically adjusts based on network conditions |
| Fixed number | Always uses specified lamport amount |

**Fee Guidelines:**

| Fee (lamports) | Cost per tx | Speed |
|----------------|-------------|-------|
| 1,000 | ~$0.0001 | Standard |
| 10,000 | ~$0.001 | Fast |
| 100,000 | ~$0.01 | Priority |
| 1,000,000 | ~$0.10 | Urgent |

---

## Starting/Stopping Bots

### Via the UI

[Screenshot: Bot Manager showing Start/Pause/Stop buttons on bot cards]

1. Navigate to **Bot Manager** in the sidebar
2. Click **"New Bot"** to create a bot
3. Configure settings in the modal
4. Click **"Start"** to begin trading

**Bot Controls:**
- **▶ Start** - Begin executing swaps
- **⏸ Pause** - Temporarily halt (state preserved)
- **⏹ Stop** - Permanently stop (can be removed)

### Via Code

```typescript
import { Orchestrator } from '@trenchsniper/core';

const orchestrator = new Orchestrator(config);

// Create a new bot
const botId = await orchestrator.createBot({
  targetToken: 'TOKEN_MINT_ADDRESS',
  direction: 'both',
  minSwapSol: 0.01,
  maxSwapSol: 0.1,
  minIntervalMs: 30000,
  maxIntervalMs: 120000,
});

// Start the bot
await orchestrator.startBot(botId);

// Pause when needed
await orchestrator.pauseBot(botId);

// Resume
await orchestrator.resumeBot(botId);

// Stop permanently
await orchestrator.stopBot(botId);
```

### Bot Lifecycle States

```
     ┌─────────────────────────────────────┐
     │                                     │
     ▼                                     │
   idle ──► starting ──► running ──► paused
                │           │           │
                ▼           ▼           ▼
              error      stopping     stopped
                │           │
                └─────►─────┘
```

| State | Description | Can Transition To |
|-------|-------------|-------------------|
| `idle` | Initial state, not started | starting, stopped |
| `starting` | Initializing | running, error, stopped |
| `running` | Actively trading | paused, stopping, error |
| `paused` | Temporarily halted | running, stopping, stopped |
| `stopping` | Shutting down | stopped, error |
| `stopped` | Permanently stopped | (terminal) |
| `error` | Failed, needs intervention | idle, stopped |

---

## Monitoring Bot Health

### Key Metrics to Watch

| Metric | Healthy Range | Warning Signs |
|--------|---------------|---------------|
| Success Rate | > 90% | Dropping below 80% |
| Swaps/Hour | Consistent with config | Large deviations |
| Last Swap | < max interval | Exceeds 2x max interval |
| Error Count | < 5% of total | Rising error count |

### In the UI

[Screenshot: Bot card showing success rate, volume, and last swap time]

The Bot Manager displays real-time stats:
- **Success Rate:** Percentage of successful swaps
- **Volume:** Total SOL traded
- **Swaps:** Successful / Attempted
- **Last Swap:** Time since last execution

### Programmatic Monitoring

```typescript
// Get bot statistics
const stats = orchestrator.getBotStats(botId);

console.log(`Success rate: ${(stats.swapsSuccessful / stats.swapsAttempted * 100).toFixed(1)}%`);
console.log(`Total volume: ${stats.totalVolumeSol} SOL`);
console.log(`Errors: ${stats.errors.length}`);

// Get orchestrator-wide stats
const orchestratorStats = orchestrator.getStats();
console.log(`Active bots: ${orchestratorStats.activeBots}`);
console.log(`Total swaps: ${orchestratorStats.totalSwapsExecuted}`);
```

---

## Troubleshooting Common Issues

### Bot Stuck in "Starting" State

**Symptoms:** Bot shows "starting" but never transitions to "running"

**Causes & Solutions:**

1. **RPC Connection Failed**
   ```bash
   # Test your RPC endpoint
   curl -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
     YOUR_RPC_ENDPOINT
   ```

2. **Wallet Not Funded**
   ```typescript
   // Check wallet balance
   const balance = await connection.getBalance(walletPublicKey);
   console.log(`Balance: ${balance / 1e9} SOL`);
   ```

3. **Token Account Missing**
   - Ensure the bot's wallet has an associated token account

### High Failure Rate

**Symptoms:** Success rate below 80%

**Common Causes:**

| Cause | Solution |
|-------|----------|
| Low slippage | Increase `slippageBps` to 200-300 |
| Network congestion | Increase `priorityFee` |
| Insufficient balance | Add more SOL to bot wallet |
| Pool liquidity issues | Reduce `maxSwapSol` |

### Swaps Not Landing

**Symptoms:** Transactions confirmed but swaps fail

**Solutions:**

1. **Increase Priority Fees**
   ```typescript
   priorityFee: 50000  // ~0.00005 SOL per tx
   ```

2. **Use Jito Bundles** (MEV protection)
   ```typescript
   jito: {
     enabled: true,
     tipLamports: 10000,
   }
   ```

3. **Check RPC Health**
   - Switch to a different RPC endpoint
   - Use multiple endpoints with load balancing

### Bot in Error State

**Symptoms:** Bot shows "error" status

**Recovery Steps:**

1. Check the error log:
   ```typescript
   const stats = orchestrator.getBotStats(botId);
   console.log('Recent errors:', stats.errors);
   ```

2. Address the underlying issue

3. Recover the bot:
   ```typescript
   // Reset to idle, then restart
   await orchestrator.recoverBot(botId);
   await orchestrator.startBot(botId);
   ```

---

## Best Practices

### 1. Start Conservative

Begin with low-intensity settings and scale up:

```typescript
// Start here
{
  minSwapSol: 0.01,
  maxSwapSol: 0.05,
  minIntervalMs: 60000,   // 1 minute
  maxIntervalMs: 180000,  // 3 minutes
}

// Scale to this
{
  minSwapSol: 0.05,
  maxSwapSol: 0.2,
  minIntervalMs: 30000,   // 30 seconds
  maxIntervalMs: 120000,  // 2 minutes
}
```

### 2. Use Multiple Small Bots

Instead of one large bot, use several smaller ones:
- Better failure isolation
- More natural-looking volume
- Easier to manage and debug

### 3. Monitor Regularly

Check bot health at least daily:
- Review success rates
- Check error logs
- Verify volume targets

### 4. Set Hard Limits

Always configure safety limits:
```typescript
{
  maxTotalVolumeSol: 100,  // Cap total volume
  stopAfterSwaps: 1000,    // Auto-stop after N swaps
  maxSwapsPerHour: 60,     // Rate limiting
}
```

---

## Related Documentation

- **[Volume Patterns](./VOLUME_PATTERNS.md)** - Pattern strategies for volume boosting
- **[Detection Guide](./DETECTION_GUIDE.md)** - Avoid detection red flags
- **[FAQ](./FAQ.md)** - Common questions

---

*Need help? Check the [FAQ](./FAQ.md) or open a GitHub issue.*
