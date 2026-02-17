import { describe, expect, it } from 'vitest';
import { estimateRunout } from '../estimate.js';

describe('estimateRunout', () => {
  it('computes deterministic runout math for fixed swap sizes', () => {
    const result = estimateRunout({
      usableSol: 1,
      minSwapSol: 1,
      maxSwapSol: 1,
      txFeeSol: 0,
      creatorFeeBps: 30,
      protocolFeeBps: 93,
      lpFeeBps: 2,
    });

    expect(result.lossPerSwapSol).toBeCloseTo(0.0125, 9);
    expect(result.maxSwaps).toBe(80);
    expect(result.projectedVolumeSol).toBeCloseTo(80, 9);
    expect(result.theoreticalMaxVolumeSol).toBeCloseTo(80, 9);
    expect(result.creatorReinvestCycles).toBe(2);
    expect(result.creatorReinvestedSwaps).toBe(23);
    expect(result.creatorReinvestedVolumeSol).toBeCloseTo(23, 9);
    expect(result.totalProjectedSwapsWithCreatorReinvest).toBe(103);
    expect(result.totalProjectedVolumeWithCreatorReinvestSol).toBeCloseTo(103, 9);
    expect(result.volumeMultiplierWithCreatorReinvest).toBeCloseTo(103, 9);
  });

  it('returns realistic 1 SOL upper bounds for 0.30% fee (not 1000x)', () => {
    const result = estimateRunout({
      usableSol: 1,
      minSwapSol: 1,
      maxSwapSol: 1,
      txFeeSol: 0,
      creatorFeeBps: 5,
      protocolFeeBps: 5,
      lpFeeBps: 20,
    });

    expect(result.theoreticalMaxVolumeSol).toBeCloseTo(333.333333, 3);
    expect(result.theoreticalMaxVolumeSol).toBeLessThan(400);
    expect(result.totalProjectedVolumeWithCreatorReinvestSol).toBeGreaterThan(result.projectedVolumeSol);
    expect(result.creatorReinvestCycles).toBeGreaterThan(0);
  });

  it('includes network fee in runout loss per swap', () => {
    const noNetwork = estimateRunout({
      usableSol: 1,
      minSwapSol: 0.1,
      maxSwapSol: 0.1,
      txFeeSol: 0,
      creatorFeeBps: 5,
      protocolFeeBps: 5,
      lpFeeBps: 20,
    });
    const withNetwork = estimateRunout({
      usableSol: 1,
      minSwapSol: 0.1,
      maxSwapSol: 0.1,
      txFeeSol: 0.00005,
      creatorFeeBps: 5,
      protocolFeeBps: 5,
      lpFeeBps: 20,
    });

    expect(withNetwork.lossPerSwapSol).toBeGreaterThan(noNetwork.lossPerSwapSol);
    expect(withNetwork.maxSwaps).toBeLessThan(noNetwork.maxSwaps);
  });

  it('returns no reinvestment projection when creator fee is zero', () => {
    const result = estimateRunout({
      usableSol: 1,
      minSwapSol: 0.1,
      maxSwapSol: 0.1,
      txFeeSol: 0.00005,
      creatorFeeBps: 0,
      protocolFeeBps: 5,
      lpFeeBps: 25,
    });

    expect(result.creatorReinvestCycles).toBe(0);
    expect(result.creatorReinvestedSwaps).toBe(0);
    expect(result.creatorReinvestedVolumeSol).toBe(0);
    expect(result.totalProjectedVolumeWithCreatorReinvestSol).toBeCloseTo(result.projectedVolumeSol, 9);
  });
});
