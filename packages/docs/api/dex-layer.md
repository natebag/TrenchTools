# DEX Layer API

The DEX abstraction layer provides a unified interface for swapping on any supported Solana DEX.

**Location**: `packages/ui/src/lib/dex/`

## Types

```typescript
type DexType = 'jupiter' | 'pumpfun' | 'raydium' | 'meteora'

interface DexConfig {
  rpcUrl: string
  slippageBps?: number      // Basis points (100 = 1%)
  priorityFee?: number      // Extra lamports per CU
  jupiterApiKey?: string    // Optional Jupiter API key
}

interface Quote {
  dex: DexType
  inputMint: string
  outputMint: string
  inputAmount: number       // Raw amount (lamports or smallest unit)
  outputAmount: number      // Expected output
  priceImpact?: number      // Percentage
  route?: any               // DEX-specific route data
}

interface SwapResult {
  success: boolean
  txHash?: string
  inputAmount: number
  outputAmount: number
  error?: string
}
```

## Functions

### getQuote

```typescript
async function getQuote(
  dexType: DexType,
  inputMint: string,
  outputMint: string,
  amount: number,
  config: DexConfig
): Promise<Quote>
```

Gets a swap quote from the specified DEX.

**Parameters**:
- `dexType` — Which DEX to query
- `inputMint` — Token mint address to sell
- `outputMint` — Token mint address to buy
- `amount` — Amount of input token (raw units)
- `config` — RPC URL, slippage, API keys

**Returns**: A `Quote` object with expected output and route data.

### executeSwap

```typescript
async function executeSwap(
  quote: Quote,
  wallet: Keypair,
  config: DexConfig
): Promise<SwapResult>
```

Executes a swap using a previously fetched quote.

**Parameters**:
- `quote` — Quote object from `getQuote()`
- `wallet` — Solana `Keypair` to sign the transaction
- `config` — Same config used for the quote

**Returns**: A `SwapResult` with transaction hash and actual amounts.

## Jupiter Implementation

**File**: `packages/ui/src/lib/dex/jupiter.ts`

Uses the Jupiter Quote API and Swap API:
- Quote: `GET https://quote-api.jup.ag/v6/quote`
- Swap: `POST https://quote-api.jup.ag/v6/swap`

Amounts are in **lamports** (raw integer units). Slippage is in **basis points**.

## PumpFun Implementation

**File**: `packages/ui/src/lib/dex/pumpfun.ts`

Uses the PumpPortal API:
- Buy: `POST https://pumpportal.fun/api/trade-local`
- Sell: `POST https://pumpportal.fun/api/trade-local`

Key differences from Jupiter:
- Buy amounts in **SOL** (human-readable, not lamports)
- Sell amounts in **tokens** (human-readable, divide raw by 10^decimals)
- Slippage as **percentage** (not basis points)
- No API key required
- 0.01 SOL reserved for rent/fees on buys

## Auto-Detection

```typescript
// Detect if a token is on PumpFun's bonding curve
async function detectDex(tokenMint: string, connection: Connection): Promise<DexType> {
  const bondingCurve = derivePumpFunBondingCurve(tokenMint)
  const info = await connection.getAccountInfo(bondingCurve)

  if (info && info.data[48] === 0) {
    return 'pumpfun'  // Still on bonding curve
  }
  return 'jupiter'    // Graduated or not PumpFun
}
```

## Adding a New DEX

1. Create `packages/ui/src/lib/dex/newdex.ts`
2. Implement `getQuote()` and `executeSwap()` matching the interface
3. Register it in the DEX registry (`packages/ui/src/lib/dex/index.ts`)
4. Add the type to `DexType` union
