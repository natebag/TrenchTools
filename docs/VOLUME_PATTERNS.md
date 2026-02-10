# Volume Patterns Guide

This guide explains volume boosting strategies and pattern types in TrenchSniper-OS.

## Why Volume Boosting?

Volume is a key metric that traders use to evaluate tokens:

| High Volume Signals | Low Volume Signals |
|---------------------|-------------------|
| Active interest | Low interest |
| Healthy liquidity | Difficult to trade |
| Established market | New/untested |
| Visibility on trackers | Hidden from scanners |

Volume boosting helps new tokens:
- **Gain visibility** on DEX screeners (DexScreener, Birdeye)
- **Build credibility** with traders
- **Improve price discovery** on bonding curves
- **Attract organic traders** through social proof

> ⚠️ **Disclaimer:** Volume boosting should complement real organic interest. Purely artificial volume without underlying value will eventually fail.

---

## Pattern Types

TrenchSniper-OS offers four volume patterns, each with distinct characteristics:

### 1. Organic Pattern

**Best for:** Long-term credibility, avoiding detection

```
Volume
  │     ╭─╮           ╭──╮
  │   ╭─╯ ╰─╮       ╭─╯  ╰─────╮
  │╭──╯     ╰───────╯          ╰─╮
  └──────────────────────────────── Time
```

**Characteristics:**
- Highly randomized timing (±50% variance)
- Varied trade sizes (power-law distribution)
- Natural peaks and valleys
- Simulates real human trading behavior

**Configuration:**
```typescript
{
  pattern: 'organic',
  minIntervalMs: 30000,   // Base: 30s
  maxIntervalMs: 180000,  // Base: 3m
  minSwapSol: 0.01,
  maxSwapSol: 0.15,
  // Organic adds ±50% randomization on top
}
```

**Best Practices:**
- Use 5-10 wallets for diversity
- Let bots run 24/7 for natural patterns
- Accept some quiet periods - they look real

### 2. Steady Pattern

**Best for:** Consistent baseline volume, established tokens

```
Volume
  │────────────────────────────────
  │════════════════════════════════
  │────────────────────────────────
  └──────────────────────────────── Time
```

**Characteristics:**
- Consistent trade frequency
- Minimal timing variance (±20%)
- Even distribution throughout day
- Predictable, reliable volume

**Configuration:**
```typescript
{
  pattern: 'steady',
  minIntervalMs: 45000,   // ~1 trade per minute
  maxIntervalMs: 75000,
  minSwapSol: 0.05,
  maxSwapSol: 0.08,       // Tight range
}
```

**Best Practices:**
- Good for maintaining existing volume
- Use fewer wallets (3-5)
- Lower detection risk than aggressive patterns

### 3. Burst Pattern

**Best for:** Announcements, launches, attention grabs

```
Volume
  │                    ████
  │          ██        ████
  │    ██    ██   ██   ████  ██
  │────██────██───██───████──██─── Time
```

**Characteristics:**
- Concentrated activity bursts
- Quiet periods between bursts
- High volume in short windows
- Mimics news/event-driven trading

**Configuration:**
```typescript
{
  pattern: 'burst',
  burstDurationMs: 300000,     // 5 minute bursts
  burstIntervalMs: 1800000,    // Every 30 minutes
  burstIntensity: 5,           // 5x normal volume
  minSwapSol: 0.1,
  maxSwapSol: 0.3,
}
```

**Best Practices:**
- Time bursts around announcements
- Don't overuse - becomes obvious
- Follow up with organic pattern

### 4. Wave Pattern

**Best for:** Natural daily cycles, longer campaigns

```
Volume
  │      ╭───╮              ╭───╮
  │    ╭─╯   ╰─╮          ╭─╯   ╰─╮
  │  ╭─╯       ╰─╮      ╭─╯       ╰─╮
  │╭─╯           ╰──────╯           ╰──
  └──────────────────────────────── Time
```

**Characteristics:**
- Gradual increases and decreases
- Sinusoidal volume curves
- Mimics timezone activity patterns
- Looks like global trader activity

**Configuration:**
```typescript
{
  pattern: 'wave',
  wavePeriodMs: 14400000,      // 4-hour cycles
  peakMultiplier: 3,           // Peak is 3x trough
  minSwapSol: 0.02,
  maxSwapSol: 0.12,
}
```

**Best Practices:**
- Align peaks with high-activity timezones
- Use 4-6 hour cycle periods
- Combine with organic randomization

---

## Choosing the Right Pattern

### Decision Matrix

| Factor | Organic | Steady | Burst | Wave |
|--------|---------|--------|-------|------|
| **Detection Risk** | Low | Medium | High | Low |
| **Volume Consistency** | Variable | High | Sporadic | Variable |
| **Best Duration** | Weeks+ | Days-Weeks | Hours | Days |
| **Wallet Count** | 5-10 | 3-5 | 10+ | 5-8 |
| **SOL Required** | Medium | Low | High | Medium |

### Use Case Recommendations

| Scenario | Recommended Pattern |
|----------|---------------------|
| New token launch (day 1-3) | Burst → Organic |
| Establishing baseline | Steady |
| Long-term maintenance | Organic |
| Major announcement | Burst |
| 24/7 global presence | Wave |
| Avoiding detection | Organic |

### Pattern Combinations

You can run multiple patterns simultaneously for natural results:

```typescript
// Example: Layer patterns for realistic volume
const patterns = [
  { type: 'organic', wallets: 5, weight: 0.5 },   // 50% organic baseline
  { type: 'wave', wallets: 3, weight: 0.3 },      // 30% wave overlay
  { type: 'burst', wallets: 2, weight: 0.2 },     // 20% periodic bursts
];
```

---

## Risk Considerations

### Detection Risks

Volume boosting carries inherent risks. The detection module can identify these patterns:

| Pattern | Detection Vulnerability | Mitigation |
|---------|------------------------|------------|
| Organic | Wallet clustering | Use diverse funding sources |
| Steady | Interval regularity | Add more randomization |
| Burst | Coordinated timing | Stagger wallet activity |
| Wave | Predictable cycles | Vary cycle parameters |

### Financial Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Slippage losses** | Buying/selling moves price | Keep swap sizes small |
| **Gas costs** | Transaction fees accumulate | Monitor total costs |
| **Impermanent loss** | Market moves against you | Use direction: 'both' |
| **Wallet exposure** | Bot wallets can be identified | Use fresh wallets |

### Reputation Risks

| Risk | Impact | Prevention |
|------|--------|------------|
| **Detection by others** | Loss of trader trust | Use organic patterns |
| **DEX delisting** | Removed from screeners | Stay under thresholds |
| **Community backlash** | Negative sentiment | Build real community too |

---

## Configuration Examples

### Conservative Setup (Low Risk)

```typescript
const conservativeConfig = {
  pattern: 'organic',
  intensity: 'low',
  dailyTargetSol: 20,
  maxWallets: 5,
  minSwapSol: 0.005,
  maxSwapSol: 0.02,
  minIntervalMs: 120000,  // 2 minutes
  maxIntervalMs: 300000,  // 5 minutes
};
```

**Expected Results:**
- ~20 SOL daily volume
- ~200-300 trades/day
- Low detection probability
- Minimal gas costs

### Balanced Setup (Medium Risk)

```typescript
const balancedConfig = {
  pattern: 'organic',
  intensity: 'medium',
  dailyTargetSol: 50,
  maxWallets: 10,
  minSwapSol: 0.01,
  maxSwapSol: 0.1,
  minIntervalMs: 30000,   // 30 seconds
  maxIntervalMs: 120000,  // 2 minutes
};
```

**Expected Results:**
- ~50 SOL daily volume
- ~500-800 trades/day
- Moderate detection probability
- ~0.5 SOL daily gas costs

### Aggressive Setup (High Risk)

```typescript
const aggressiveConfig = {
  pattern: 'burst',
  intensity: 'aggressive',
  dailyTargetSol: 200,
  maxWallets: 20,
  minSwapSol: 0.1,
  maxSwapSol: 0.5,
  minIntervalMs: 5000,    // 5 seconds
  maxIntervalMs: 30000,   // 30 seconds
};
```

**Expected Results:**
- ~200 SOL daily volume
- ~2000+ trades/day
- High detection probability
- ~2 SOL daily gas costs

> ⚠️ **Warning:** Aggressive setups have high detection risk and significant costs. Use for short campaigns only.

---

## Monitoring Your Pattern

### Key Metrics to Track

```typescript
interface PatternMetrics {
  volumeToday: number;        // SOL traded today
  avgTradeSize: number;       // Average swap size
  intervalVariance: number;   // Higher = more random
  walletDistribution: number; // Even = 1.0
  detectionScore: number;     // Lower = better
}
```

### UI Monitoring

[Screenshot: Volume Control panel showing pattern stats and detection score]

1. Navigate to **Volume Control**
2. Check the stats panel:
   - Current Rate (SOL/hour)
   - Success Rate (%)
   - Active Wallets
3. Monitor your own detection score regularly

### Adjusting in Real-Time

If detection score rises:

```typescript
// Option 1: Reduce intensity
updateConfig({ intensity: 'low' });

// Option 2: Switch pattern
updateConfig({ pattern: 'organic' });

// Option 3: Reduce wallet count
updateConfig({ maxWallets: 5 });

// Option 4: Pause and reset
orchestrator.pauseAllBots();
await sleep(3600000);  // Wait 1 hour
orchestrator.resumeAllBots();
```

---

## Best Practices Summary

### Do ✅

- Start conservative, scale gradually
- Use organic pattern as baseline
- Diversify wallet funding sources
- Monitor your detection score
- Take breaks between campaigns
- Build real community alongside volume

### Don't ❌

- Run aggressive patterns for extended periods
- Use the same wallet cluster repeatedly
- Ignore rising detection scores
- Neglect gas cost monitoring
- Rely solely on artificial volume

---

## Related Documentation

- **[Bot Configuration](./BOT_CONFIGURATION.md)** - Detailed bot settings
- **[Detection Guide](./DETECTION_GUIDE.md)** - Understand what triggers detection
- **[FAQ](./FAQ.md)** - Common questions

---

*Volume patterns are tools for market making. Use responsibly.*
