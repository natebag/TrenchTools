# Shield Scanner

The Shield Scanner analyzes tokens for honeypot indicators and rug-pull risk before you buy.

## What It Checks

| Check | Description | Risk If Found |
|-------|-------------|---------------|
| **Mint Authority** | Can the creator mint more tokens? | High — unlimited supply dilution |
| **Freeze Authority** | Can the creator freeze your tokens? | Critical — you can't sell |
| **Transfer Restrictions** | Are there hidden transfer limits? | Critical — can't move tokens |
| **Pause Functionality** | Can trading be paused? | High — can be trapped |
| **Blacklist** | Can specific wallets be blacklisted? | High — your wallet could be blocked |
| **High Tax** | Excessive buy/sell tax on transfers? | Medium — erosion of value |

## Risk Score

Each token gets a risk score from 0-100:

| Score | Rating | Meaning |
|-------|--------|---------|
| 0-20 | Safe | No significant risks detected |
| 21-40 | Low Risk | Minor concerns, proceed with caution |
| 41-60 | Medium Risk | Multiple flags, higher scrutiny needed |
| 61-80 | High Risk | Significant honeypot indicators |
| 81-100 | Danger | Almost certainly a honeypot or rug |

## How to Use

1. Navigate to the **Shield** tab
2. Paste a token CA
3. Click **Scan**
4. Review the risk assessment, individual checks, and warnings

::: tip
Always scan a token before sniping, especially for new or unknown tokens. A 30-second scan can save you from a complete loss.
:::

## Output

The scanner returns:
- `isHoneypot: boolean` — Overall honeypot determination
- `canSell: boolean` — Whether you'd be able to sell after buying
- `riskScore: number` — 0-100 risk rating
- `warnings: string[]` — Specific risk factors found
- Individual check results with pass/fail
