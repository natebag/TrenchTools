# DEX Auto-Routing

TrenchSniper OS automatically detects which DEX a token is traded on and routes swaps accordingly. You never need to manually select a DEX.

## How It Works

When you paste a token contract address (CA), the system:

1. **Derives the PumpFun bonding curve PDA** from the token mint
2. **Fetches the account data** from chain
3. **Checks the `complete` flag** at byte offset 48
4. If the bonding curve exists and `complete === false` → **PumpFun** (still on bonding curve)
5. If the bonding curve doesn't exist or `complete === true` → **Jupiter** (graduated to DEX)

```typescript
// Simplified detection logic
const bondingCurve = derivePumpFunBondingCurve(tokenMint)
const accountInfo = await connection.getAccountInfo(bondingCurve)

if (accountInfo && accountInfo.data[48] === 0) {
  // Token is on PumpFun bonding curve
  return 'pumpfun'
} else {
  // Token has graduated or isn't PumpFun
  return 'jupiter'
}
```

## Supported DEXes

| DEX | Status | API | Used For |
|-----|--------|-----|----------|
| **Jupiter** | Fully implemented | Jupiter Quote + Swap API | Post-graduation tokens, any Solana token |
| **PumpFun** | Fully implemented | PumpPortal API | Pre-graduation bonding curve tokens |
| **Raydium** | Stubbed | — | Future |
| **Meteora** | Stubbed | — | Future |

## DEX Abstraction Layer

All DEX integrations follow the same interface:

```typescript
interface DexSwapper {
  getQuote(inputMint: string, outputMint: string, amount: number, config: DexConfig): Promise<Quote>
  executeSwap(quote: Quote, wallet: Keypair, config: DexConfig): Promise<SwapResult>
}
```

This means all components (Sniper, Volume, Bot Groups, Treasury) use the same swap logic without caring about which DEX is underneath.

## PumpFun Specifics

- **Buy amounts**: Specified in SOL (human-readable)
- **Sell amounts**: Specified in tokens (human-readable, divide raw by 10^decimals)
- **Slippage**: Percentage (not basis points)
- **Fee reserve**: 0.01 SOL reserved for rent/fees on buys
- **API**: PumpPortal API (no API key required)

## Jupiter Specifics

- **Amounts**: Specified in lamports (raw integer)
- **Slippage**: Basis points (100 = 1%)
- **API key**: Optional but recommended for rate limits
- **Priority fees**: Configurable for transaction priority
