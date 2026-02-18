# Manipulation Detection

Powered by [Allium](https://allium.so/), the Manipulation Detection dashboard identifies artificial trading patterns that may indicate market manipulation.

## Patterns Detected

| Pattern | What It Means | Confidence |
|---------|--------------|------------|
| **Wallet Clustering** | Multiple wallets controlled by the same entity trading in coordination | High |
| **Interval Regularity** | Trades happening at suspiciously regular intervals (bot-like timing) | Medium |
| **Size Distribution** | Identical or near-identical trade amounts (not natural) | Medium |
| **Coordinated Timing** | Multiple wallets executing trades at the same time | High |
| **New Wallet Spam** | Fresh wallets with no history suddenly active on a token | Medium |
| **Circular Trading** | SOL/tokens flowing in loops between related wallets | High |
| **Wash Trading** | Same entity buying and selling to inflate volume | High |

## How to Use

1. Navigate to the **Detection** tab
2. Enter a token CA to analyze
3. Click **Scan**
4. Review detected patterns with confidence scores

## Alert Output

Each detection returns:
- **Priority**: Low / Medium / High / Critical
- **Patterns Found**: List of detected manipulation types
- **Confidence Score**: How certain the detection is (0-100%)
- **Evidence**: Specific wallet addresses and transactions involved
- **Recommendation**: Whether to avoid the token

## Data Source

Detection analysis uses the Allium API which indexes Solana transaction data and applies machine learning models to identify manipulation patterns. The analysis considers:
- Transaction timing and intervals
- Wallet creation dates and history
- Fund flow between wallets
- Trade size distributions
- Network graph analysis of related wallets

::: warning
Detection is probabilistic, not definitive. A "clean" scan doesn't guarantee safety — it means no known manipulation patterns were detected. Always combine with Shield Scanner results and your own research.
:::
