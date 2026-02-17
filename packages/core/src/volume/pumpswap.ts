import { Connection, PublicKey } from '@solana/web3.js';
import * as pumpfun from '../snipe/pumpfun.js';
import * as raydium from '../snipe/raydium.js';

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPSWAP_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const PUMP_FEE_PROGRAM_ID = new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const CANONICAL_POOL_INDEX = 0;

export interface FeeBpsBreakdown {
  creatorFeeBps: number;
  protocolFeeBps: number;
  lpFeeBps: number;
  totalFeeBps: number;
}

export interface PumpSwapFeeTier extends FeeBpsBreakdown {
  index: number;
  marketCapLamportsThreshold: bigint;
  marketCapSolThreshold: number;
}

export interface PoolVenueDetection {
  tokenMint: string;
  canonicalPumpSwapPoolAddress: string;
  isOnPumpFunBondingCurve: boolean;
  hasPumpSwapCanonicalPool: boolean;
  hasRaydiumPool: boolean;
  warnings: string[];
}

export interface PumpSwapFeeProfile {
  tokenMint: string;
  canonicalPumpSwapPoolAddress: string;
  feeConfigAddress: string;
  isCanonicalPool: boolean;
  selectedFeeSource: 'canonical_tier' | 'flat_fees' | 'fallback_flat_fees';
  selectedFeesBps: FeeBpsBreakdown;
  flatFeesBps: FeeBpsBreakdown;
  tiers: PumpSwapFeeTier[];
  selectedTier?: PumpSwapFeeTier;
  marketCapLamports?: bigint;
  marketCapSol?: number;
  warnings: string[];
}

interface DecodedPumpSwapFeeConfig {
  flatFeesBps: FeeBpsBreakdown;
  feeTiers: PumpSwapFeeTier[];
}

interface DecodedCanonicalPool {
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
}

const FALLBACK_FLAT_FEES_BPS: FeeBpsBreakdown = withTotal({
  creatorFeeBps: 0,
  protocolFeeBps: 5,
  lpFeeBps: 25,
});

const FALLBACK_FEE_TIERS: PumpSwapFeeTier[] = [
  tier(0, 0n, 30, 93, 2),
  tier(1, 420_000_000_000n, 95, 5, 20),
  tier(2, 1_470_000_000_000n, 90, 5, 20),
  tier(3, 2_460_000_000_000n, 85, 5, 20),
  tier(4, 3_440_000_000_000n, 80, 5, 20),
  tier(5, 4_420_000_000_000n, 75, 5, 20),
  tier(6, 9_820_000_000_000n, 70, 5, 20),
  tier(7, 14_740_000_000_000n, 65, 5, 20),
  tier(8, 19_650_000_000_000n, 60, 5, 20),
  tier(9, 24_560_000_000_000n, 55, 5, 20),
  tier(10, 29_470_000_000_000n, 50, 5, 20),
  tier(11, 34_380_000_000_000n, 45, 5, 20),
  tier(12, 39_300_000_000_000n, 40, 5, 20),
  tier(13, 44_210_000_000_000n, 35, 5, 20),
  tier(14, 49_120_000_000_000n, 30, 5, 20),
  tier(15, 54_030_000_000_000n, 28, 5, 20),
  tier(16, 58_940_000_000_000n, 25, 5, 20),
  tier(17, 63_860_000_000_000n, 23, 5, 20),
  tier(18, 68_770_000_000_000n, 20, 5, 20),
  tier(19, 73_681_000_000_000n, 18, 5, 20),
  tier(20, 78_590_000_000_000n, 15, 5, 20),
  tier(21, 83_500_000_000_000n, 13, 5, 20),
  tier(22, 88_400_000_000_000n, 10, 5, 20),
  tier(23, 93_330_000_000_000n, 8, 5, 20),
  tier(24, 98_240_000_000_000n, 5, 5, 20),
];

export function derivePumpPoolAuthorityPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool-authority'), tokenMint.toBuffer()],
    PUMP_PROGRAM_ID
  );
  return pda;
}

export function deriveCanonicalPumpSwapPoolPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('pool'),
      Buffer.from([CANONICAL_POOL_INDEX, 0]),
      derivePumpPoolAuthorityPda(tokenMint).toBuffer(),
      tokenMint.toBuffer(),
      WSOL_MINT.toBuffer(),
    ],
    PUMPSWAP_PROGRAM_ID
  );
  return pda;
}

export function derivePumpSwapFeeConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_config'), PUMPSWAP_PROGRAM_ID.toBuffer()],
    PUMP_FEE_PROGRAM_ID
  );
  return pda;
}

export function decodePumpSwapFeeConfigAccount(data: Buffer): DecodedPumpSwapFeeConfig {
  if (data.length < 8 + 1 + 32 + 24 + 4) {
    throw new Error('Fee config account too small');
  }

  let offset = 8;
  offset += 1; // bump
  offset += 32; // admin

  const flatLp = toBpsNumber(data.readBigUInt64LE(offset));
  offset += 8;
  const flatProtocol = toBpsNumber(data.readBigUInt64LE(offset));
  offset += 8;
  const flatCreator = toBpsNumber(data.readBigUInt64LE(offset));
  offset += 8;

  const feeTierCount = data.readUInt32LE(offset);
  offset += 4;

  const feeTiers: PumpSwapFeeTier[] = [];
  for (let i = 0; i < feeTierCount; i++) {
    if (offset + 40 > data.length) {
      break;
    }
    const threshold = readU128LE(data, offset);
    offset += 16;

    const lpFeeBps = toBpsNumber(data.readBigUInt64LE(offset));
    offset += 8;
    const protocolFeeBps = toBpsNumber(data.readBigUInt64LE(offset));
    offset += 8;
    const creatorFeeBps = toBpsNumber(data.readBigUInt64LE(offset));
    offset += 8;

    feeTiers.push({
      index: i,
      marketCapLamportsThreshold: threshold,
      marketCapSolThreshold: Number(threshold) / 1_000_000_000,
      ...withTotal({ creatorFeeBps, protocolFeeBps, lpFeeBps }),
    });
  }

  feeTiers.sort((a, b) => (a.marketCapLamportsThreshold < b.marketCapLamportsThreshold ? -1 : 1));

  return {
    flatFeesBps: withTotal({
      creatorFeeBps: flatCreator,
      protocolFeeBps: flatProtocol,
      lpFeeBps: flatLp,
    }),
    feeTiers,
  };
}

export function decodeCanonicalPoolAccount(data: Buffer): DecodedCanonicalPool {
  if (data.length < 8 + 195) {
    throw new Error('Canonical PumpSwap pool account too small');
  }

  let offset = 8;
  offset += 1; // pool bump
  offset += 2; // index (u16)

  const creator = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const baseMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const quoteMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  offset += 32; // lp mint

  const poolBaseTokenAccount = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const poolQuoteTokenAccount = new PublicKey(data.subarray(offset, offset + 32));

  return {
    creator,
    baseMint,
    quoteMint,
    poolBaseTokenAccount,
    poolQuoteTokenAccount,
  };
}

export function selectFeeTierByMarketCap(
  feeTiers: PumpSwapFeeTier[],
  marketCapLamports: bigint
): PumpSwapFeeTier {
  if (feeTiers.length === 0) {
    throw new Error('No PumpSwap fee tiers available');
  }

  let selected = feeTiers[0];
  for (const tier of feeTiers) {
    if (marketCapLamports >= tier.marketCapLamportsThreshold) {
      selected = tier;
      continue;
    }
    break;
  }
  return selected;
}

export async function detectTokenVenues(
  connection: Connection,
  tokenMintInput: PublicKey | string
): Promise<PoolVenueDetection> {
  const tokenMint = normalizeMint(tokenMintInput);
  const canonicalPoolAddress = deriveCanonicalPumpSwapPoolPda(tokenMint);
  const warnings: string[] = [];

  const [pumpfunCheck, canonicalPoolCheck, raydiumCheck] = await Promise.allSettled([
    pumpfun.isOnPumpFun(connection, tokenMint),
    connection.getAccountInfo(canonicalPoolAddress, 'confirmed'),
    raydium.getPools(connection, tokenMint),
  ]);

  const isOnPumpFunBondingCurve =
    pumpfunCheck.status === 'fulfilled' ? pumpfunCheck.value : false;
  if (pumpfunCheck.status === 'rejected') {
    warnings.push(`PumpFun check failed: ${(pumpfunCheck.reason as Error).message}`);
  }

  const hasPumpSwapCanonicalPool =
    canonicalPoolCheck.status === 'fulfilled' && canonicalPoolCheck.value !== null;
  if (canonicalPoolCheck.status === 'rejected') {
    warnings.push(`PumpSwap canonical pool check failed: ${(canonicalPoolCheck.reason as Error).message}`);
  }

  const hasRaydiumPool =
    raydiumCheck.status === 'fulfilled' && raydiumCheck.value.length > 0;
  if (raydiumCheck.status === 'rejected') {
    warnings.push(`Raydium pool check failed: ${(raydiumCheck.reason as Error).message}`);
  }

  return {
    tokenMint: tokenMint.toBase58(),
    canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
    isOnPumpFunBondingCurve,
    hasPumpSwapCanonicalPool,
    hasRaydiumPool,
    warnings,
  };
}

export async function getPumpSwapCanonicalFeeProfile(
  connection: Connection,
  tokenMintInput: PublicKey | string
): Promise<PumpSwapFeeProfile> {
  const tokenMint = normalizeMint(tokenMintInput);
  const canonicalPoolAddress = deriveCanonicalPumpSwapPoolPda(tokenMint);
  const feeConfigAddress = derivePumpSwapFeeConfigPda();
  const warnings: string[] = [];

  let flatFees = FALLBACK_FLAT_FEES_BPS;
  let feeTiers = FALLBACK_FEE_TIERS;
  let selectedFeeSource: PumpSwapFeeProfile['selectedFeeSource'] = 'fallback_flat_fees';

  try {
    const feeConfigInfo = await connection.getAccountInfo(feeConfigAddress, 'confirmed');
    if (feeConfigInfo?.data) {
      const decoded = decodePumpSwapFeeConfigAccount(feeConfigInfo.data);
      if (decoded.feeTiers.length > 0) {
        feeTiers = decoded.feeTiers;
      } else {
        warnings.push('PumpSwap fee config returned no tiers, using fallback tiers');
      }
      flatFees = decoded.flatFeesBps;
      selectedFeeSource = 'flat_fees';
    } else {
      warnings.push('PumpSwap fee config account unavailable, using fallback fees');
    }
  } catch (error) {
    warnings.push(`Failed to decode PumpSwap fee config: ${(error as Error).message}`);
  }

  let poolInfo: Buffer | null = null;
  try {
    poolInfo = (await connection.getAccountInfo(canonicalPoolAddress, 'confirmed'))?.data ?? null;
  } catch (error) {
    warnings.push(`Failed to fetch canonical PumpSwap pool: ${(error as Error).message}`);
  }

  if (!poolInfo) {
    return {
      tokenMint: tokenMint.toBase58(),
      canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
      feeConfigAddress: feeConfigAddress.toBase58(),
      isCanonicalPool: false,
      selectedFeeSource,
      selectedFeesBps: flatFees,
      flatFeesBps: flatFees,
      tiers: feeTiers,
      warnings,
    };
  }

  try {
    const pool = decodeCanonicalPoolAccount(poolInfo);
    const expectedCreator = derivePumpPoolAuthorityPda(tokenMint);

    if (!pool.creator.equals(expectedCreator)) {
      warnings.push('Canonical pool creator mismatch, using flat PumpSwap fee fallback');
      return {
        tokenMint: tokenMint.toBase58(),
        canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
        feeConfigAddress: feeConfigAddress.toBase58(),
        isCanonicalPool: false,
        selectedFeeSource,
        selectedFeesBps: flatFees,
        flatFeesBps: flatFees,
        tiers: feeTiers,
        warnings,
      };
    }

    if (!pool.baseMint.equals(tokenMint) || !pool.quoteMint.equals(WSOL_MINT)) {
      warnings.push('Canonical pool mint layout mismatch, using flat PumpSwap fee fallback');
      return {
        tokenMint: tokenMint.toBase58(),
        canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
        feeConfigAddress: feeConfigAddress.toBase58(),
        isCanonicalPool: false,
        selectedFeeSource,
        selectedFeesBps: flatFees,
        flatFeesBps: flatFees,
        tiers: feeTiers,
        warnings,
      };
    }

    const [baseReserveInfo, quoteReserveInfo, mintSupplyInfo] = await Promise.all([
      connection.getTokenAccountBalance(pool.poolBaseTokenAccount, 'confirmed'),
      connection.getTokenAccountBalance(pool.poolQuoteTokenAccount, 'confirmed'),
      connection.getTokenSupply(tokenMint, 'confirmed'),
    ]);

    const baseReserve = BigInt(baseReserveInfo.value.amount);
    const quoteReserve = BigInt(quoteReserveInfo.value.amount);
    const mintSupply = BigInt(mintSupplyInfo.value.amount);

    if (baseReserve === 0n) {
      warnings.push('Canonical pool base reserve is zero, using flat fee fallback');
      return {
        tokenMint: tokenMint.toBase58(),
        canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
        feeConfigAddress: feeConfigAddress.toBase58(),
        isCanonicalPool: false,
        selectedFeeSource,
        selectedFeesBps: flatFees,
        flatFeesBps: flatFees,
        tiers: feeTiers,
        warnings,
      };
    }

    const marketCapLamports = (quoteReserve * mintSupply) / baseReserve;
    const selectedTier = selectFeeTierByMarketCap(feeTiers, marketCapLamports);

    return {
      tokenMint: tokenMint.toBase58(),
      canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
      feeConfigAddress: feeConfigAddress.toBase58(),
      isCanonicalPool: true,
      selectedFeeSource: 'canonical_tier',
      selectedFeesBps: selectedTier,
      flatFeesBps: flatFees,
      tiers: feeTiers,
      selectedTier,
      marketCapLamports,
      marketCapSol: Number(marketCapLamports) / 1_000_000_000,
      warnings,
    };
  } catch (error) {
    warnings.push(`Canonical pool decoding failed: ${(error as Error).message}`);
    return {
      tokenMint: tokenMint.toBase58(),
      canonicalPumpSwapPoolAddress: canonicalPoolAddress.toBase58(),
      feeConfigAddress: feeConfigAddress.toBase58(),
      isCanonicalPool: false,
      selectedFeeSource,
      selectedFeesBps: flatFees,
      flatFeesBps: flatFees,
      tiers: feeTiers,
      warnings,
    };
  }
}

function normalizeMint(tokenMintInput: PublicKey | string): PublicKey {
  return typeof tokenMintInput === 'string'
    ? new PublicKey(tokenMintInput)
    : tokenMintInput;
}

function withTotal(input: Omit<FeeBpsBreakdown, 'totalFeeBps'>): FeeBpsBreakdown {
  return {
    ...input,
    totalFeeBps: input.creatorFeeBps + input.protocolFeeBps + input.lpFeeBps,
  };
}

function tier(
  index: number,
  marketCapLamportsThreshold: bigint,
  creatorFeeBps: number,
  protocolFeeBps: number,
  lpFeeBps: number
): PumpSwapFeeTier {
  return {
    index,
    marketCapLamportsThreshold,
    marketCapSolThreshold: Number(marketCapLamportsThreshold) / 1_000_000_000,
    ...withTotal({ creatorFeeBps, protocolFeeBps, lpFeeBps }),
  };
}

function toBpsNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Fee basis points value exceeds Number.MAX_SAFE_INTEGER');
  }
  return Number(value);
}

function readU128LE(data: Buffer, offset: number): bigint {
  const low = data.readBigUInt64LE(offset);
  const high = data.readBigUInt64LE(offset + 8);
  return low + (high << 64n);
}
