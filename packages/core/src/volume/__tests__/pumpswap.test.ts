import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  deriveCanonicalPumpSwapPoolPda,
  derivePumpPoolAuthorityPda,
  selectFeeTierByMarketCap,
  type PumpSwapFeeTier,
} from '../pumpswap.js';

function makeTier(index: number, thresholdLamports: bigint, creatorFeeBps: number): PumpSwapFeeTier {
  const protocolFeeBps = 5;
  const lpFeeBps = 20;
  return {
    index,
    marketCapLamportsThreshold: thresholdLamports,
    marketCapSolThreshold: Number(thresholdLamports) / 1_000_000_000,
    creatorFeeBps,
    protocolFeeBps,
    lpFeeBps,
    totalFeeBps: creatorFeeBps + protocolFeeBps + lpFeeBps,
  };
}

describe('pumpswap PDA derivations', () => {
  it('derives the documented canonical pool authority and canonical pool PDA', () => {
    const mint = new PublicKey('7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump');
    const authority = derivePumpPoolAuthorityPda(mint);
    const canonicalPool = deriveCanonicalPumpSwapPoolPda(mint);

    expect(authority.toBase58()).toBe('9XDYTfQKwW8sHPqnFdUreMmtmffmkHVPGTNV2e3LKxNW');
    expect(canonicalPool.toBase58()).toBe('GseMAnNDvntR5uFePZ51yZBXzNSn7GdFPkfHwfr6d77J');
  });
});

describe('pumpswap fee tier selection', () => {
  const tiers: PumpSwapFeeTier[] = [
    makeTier(0, 0n, 30),
    makeTier(1, 420_000_000_000n, 95),
    makeTier(2, 1_470_000_000_000n, 90),
    makeTier(3, 98_240_000_000_000n, 5),
  ];

  it('selects the first tier below first threshold boundary', () => {
    const selected = selectFeeTierByMarketCap(tiers, 419_999_999_999n);
    expect(selected.index).toBe(0);
    expect(selected.creatorFeeBps).toBe(30);
  });

  it('selects exact threshold tiers correctly', () => {
    const at420 = selectFeeTierByMarketCap(tiers, 420_000_000_000n);
    const at1470 = selectFeeTierByMarketCap(tiers, 1_470_000_000_000n);
    const at98240 = selectFeeTierByMarketCap(tiers, 98_240_000_000_000n);

    expect(at420.index).toBe(1);
    expect(at1470.index).toBe(2);
    expect(at98240.index).toBe(3);
  });
});

