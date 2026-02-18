# Detection Guide

This guide explains how TrenchTools's detection module identifies market manipulation patterns in token trading activity.

## What the Detection Module Does

The detection module analyzes on-chain trading data to identify suspicious patterns that may indicate:

- **Wash trading** - Artificial volume between related wallets
- **Bot activity** - Algorithmic trading with predictable patterns
- **Coordinated manipulation** - Multiple wallets acting in concert
- **Volume inflation** - Fake volume to attract retail traders

**Powered by Allium** - The detection engine uses Allium's blockchain data infrastructure for comprehensive on-chain analysis.

### Use Cases

| Role | Use Case |
|------|----------|
| **Trader** | Evaluate tokens before buying |
| **Launcher** | Monitor your own token for red flags |
| **Developer** | Integrate detection into your tools |

---

## Understanding Manipulation Scores (0-100)

Every token analysis produces a **manipulation score** from 0 to 100:

```
0 ────────────── 50 ────────────── 100
│     LOW       │     MEDIUM      │     HIGH
│   Organic     │    Suspicious   │  Manipulated
```

### Score Interpretation

| Score Range | Risk Level | Recommendation |
|-------------|------------|----------------|
| **0 - 20** | Minimal | Trading appears mostly organic |
| **20 - 40** | Low | Minor irregularities, likely normal variance |
| **40 - 60** | Moderate | Suspicious patterns detected, monitor closely |
| **60 - 80** | Elevated | Significant manipulation indicators, reduce exposure |
| **80 - 100** | High | Multiple strong indicators, exercise extreme caution |

### Score Calculation

The score weighs detected patterns by severity:

```typescript
const weights = {
  'wallet_clustering': 25,      // Related wallets trading
  'interval_regularity': 20,    // Bot-like timing
  'size_distribution': 15,      // Uniform trade sizes
  'coordinated_timing': 25,     // Synchronized activity
  'new_wallet_spam': 20,        // Fresh wallet flood
  'circular_trading': 30,       // Round-trip trades
  'wash_trading': 35,           // Self-trading
};

// Diversity bonus: +5 points per unique pattern type (max +20)
```

---

## Pattern Types Explained

### 1. Wallet Clustering

**What it detects:** Wallets funded by the same source, suggesting common ownership.

**How it works:**
- Traces funding history of trading wallets
- Identifies common parent wallets
- Groups wallets into clusters

**Example Evidence:**
```json
{
  "type": "wallet_clustering",
  "confidence": 0.85,
  "evidence": [{
    "description": "5 wallets share funding source",
    "data": {
      "fundingSource": "7xKX...3nFd",
      "clusterSize": 5,
      "totalVolume": 12.5
    }
  }]
}
```

**Red Flags:**
- 5+ wallets from same funding source
- Clustered wallets contributing >50% of volume
- New wallets funded just before trading

### 2. Regular Intervals

**What it detects:** Trades occurring at suspiciously consistent time intervals.

**How it works:**
- Calculates time gaps between trades
- Measures coefficient of variation (CV)
- Low CV = high regularity = suspicious

**Detection Threshold:**
```typescript
// CV < 0.5 triggers detection
coefficientOfVariation = standardDeviation / mean
```

**Example:**
| Trading Pattern | Time Gaps | CV | Result |
|-----------------|-----------|-----|--------|
| Organic | 45s, 2m, 15s, 3m | 0.8 | ✅ Normal |
| Bot-like | 60s, 58s, 62s, 59s | 0.03 | 🚨 Suspicious |

**Evidence Example:**
```json
{
  "type": "interval_regularity",
  "confidence": 0.92,
  "evidence": [{
    "description": "Highly regular trade intervals",
    "data": {
      "meanIntervalMs": 60000,
      "stdDevMs": 2100,
      "coefficientOfVariation": 0.035
    }
  }]
}
```

### 3. Size Patterns

**What it detects:** Unnaturally uniform trade sizes.

**How it works:**
- Analyzes distribution of trade amounts
- Compares to expected organic distribution
- Flags overly uniform sizing

**What's Normal:**
- Human traders use varied amounts
- Organic distribution follows power-law curve
- Mix of round and irregular numbers

**What's Suspicious:**
- All trades exactly 0.1 SOL
- Minimal variance in sizes
- Repeated identical amounts

**Evidence Example:**
```json
{
  "type": "size_distribution",
  "confidence": 0.78,
  "evidence": [{
    "description": "Uniform trade size distribution",
    "data": {
      "uniqueSizes": 3,
      "dominantSize": 0.1,
      "dominantSizePercent": 85
    }
  }]
}
```

### 4. Coordinated Timing

**What it detects:** Multiple wallets trading simultaneously or in rapid succession.

**How it works:**
- Groups trades within time windows (default: 5 seconds)
- Identifies suspicious clusters
- Counts unique wallets per cluster

**Detection Criteria:**
- 3+ different wallets within 5-second window
- Pattern repeats multiple times
- Wallets don't trade together outside of clusters

**Evidence Example:**
```json
{
  "type": "coordinated_timing",
  "confidence": 0.88,
  "evidence": [{
    "description": "12 coordinated trading events detected",
    "data": {
      "eventCount": 12,
      "avgWalletsPerEvent": 4.2,
      "windowMs": 5000
    }
  }]
}
```

### 5. Additional Patterns

| Pattern | Description | Severity |
|---------|-------------|----------|
| **New Wallet Spam** | Flood of fresh wallets suddenly trading | High |
| **Circular Trading** | A → B → C → A round-trip patterns | Very High |
| **Wash Trading** | Same entity on both sides of trades | Critical |

---

## Alert Severity Levels

When patterns are detected, alerts are generated with priority levels:

| Priority | Trigger | Action |
|----------|---------|--------|
| **Low** | Single weak pattern | Monitor |
| **Medium** | Multiple weak patterns OR one moderate | Investigate |
| **High** | Strong pattern detected | Reduce exposure |
| **Critical** | Multiple strong patterns | Avoid/Exit |

### Alert Example

```typescript
{
  id: "alert-001",
  timestamp: 1699900000000,
  priority: "high",
  token: {
    mint: "EPjFWdd5...1v",
    symbol: "FAKE"
  },
  patterns: [
    { type: "wallet_clustering", confidence: 0.85 },
    { type: "interval_regularity", confidence: 0.72 }
  ],
  confidence: 0.785,
  recommendation: "ELEVATED RISK: Significant manipulation indicators present.",
  citation: "Powered by Allium"
}
```

---

## Using Detection to Evaluate Tokens

### Quick Scan via UI

[Screenshot: Detection Dashboard showing a token analysis with manipulation score and pattern breakdown]

1. Navigate to **Detection** in the sidebar
2. Enter the token mint address
3. Click **"Analyze"**
4. Review the manipulation score and detected patterns

### Programmatic Analysis

```typescript
import { Analyzer } from '@trenchsniper/core';

const analyzer = new Analyzer({
  allium: {
    apiKey: 'YOUR_ALLIUM_API_KEY',
  }
});

// Analyze a token
const report = await analyzer.analyzeToken(
  'TOKEN_MINT_ADDRESS',
  'solana',
  { timeRangeMs: 24 * 60 * 60 * 1000 }  // Last 24 hours
);

console.log(`Manipulation Score: ${report.manipulationScore}`);
console.log(`Patterns Found: ${report.patterns.length}`);
console.log(`Recommendation: ${report.recommendation}`);

// Check specific patterns
for (const pattern of report.patterns) {
  console.log(`- ${pattern.type}: ${(pattern.confidence * 100).toFixed(0)}% confidence`);
}
```

### Analyzing Your Own Token

If you're launching a token, periodically check your own trading activity:

```typescript
// Monitor your token for red flags
const report = await analyzer.analyzeToken(YOUR_TOKEN_MINT);

if (report.manipulationScore > 40) {
  console.warn('⚠️ Your token is showing manipulation patterns!');
  console.warn('Consider adjusting your bot settings.');
}
```

### Real-Time Monitoring

Set up continuous monitoring:

```typescript
import { Monitor } from '@trenchsniper/core';

const monitor = new Monitor({
  tokenMint: 'TOKEN_MINT_ADDRESS',
  alertThreshold: 0.6,      // Alert when confidence > 60%
  checkIntervalMs: 300000,  // Check every 5 minutes
  lookbackMs: 3600000,      // Analyze last hour
});

monitor.on('alert', (alert) => {
  console.log(`🚨 Alert: ${alert.recommendation}`);
  // Send notification, adjust bots, etc.
});

monitor.start();
```

---

## Interpreting Results

### Low Score (0-40)

```
✅ Manipulation Score: 25
✅ Patterns: 1 (weak interval regularity)
✅ Recommendation: Minor irregularities, likely normal variance
```

**Meaning:** Token trading appears mostly organic. Some bot activity is normal and doesn't necessarily indicate manipulation.

### Medium Score (40-60)

```
⚠️ Manipulation Score: 52
⚠️ Patterns: 2 (interval regularity, size distribution)
⚠️ Recommendation: Some suspicious patterns detected. Monitor closely.
```

**Meaning:** Mixed signals. Could be legitimate market making or early signs of manipulation. Watch for score increases.

### High Score (60-100)

```
🚨 Manipulation Score: 78
🚨 Patterns: 4 (clustering, intervals, timing, size)
🚨 Recommendation: Significant manipulation indicators. Reduce exposure.
```

**Meaning:** Strong evidence of artificial activity. Exercise extreme caution.

---

## Best Practices

### For Traders

1. **Always scan before buying** - 30 seconds of analysis can save you from rugs
2. **Watch for score changes** - Sudden increases indicate new manipulation
3. **Consider the context** - New tokens naturally have irregular patterns

### For Token Launchers

1. **Randomize your bots** - Use organic patterns, varied sizes
2. **Avoid clustering** - Fund bot wallets from different sources
3. **Monitor regularly** - Check your own score weekly
4. **Adjust when needed** - If score rises, change strategies

---

## Related Documentation

- **[Volume Patterns](./VOLUME_PATTERNS.md)** - How to create organic-looking volume
- **[Bot Configuration](./BOT_CONFIGURATION.md)** - Avoid detection red flags
- **[FAQ](./FAQ.md)** - Common questions

---

*Detection data powered by Allium blockchain infrastructure.*
