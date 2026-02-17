import type { FeeBpsBreakdown } from './pumpswap.js';

export interface RunoutEstimateInput {
  usableSol: number;
  minSwapSol: number;
  maxSwapSol: number;
  txFeeSol?: number;
  creatorFeeBps: number;
  protocolFeeBps: number;
  lpFeeBps: number;
}

export interface RunoutEstimateOutput {
  usableSol: number;
  avgSwapSol: number;
  txFeeSol: number;
  feeBps: FeeBpsBreakdown;
  lossPerSwapSol: number;
  maxSwaps: number;
  projectedVolumeSol: number;
  creatorLossSol: number;
  protocolLossSol: number;
  lpLossSol: number;
  networkLossSol: number;
  totalLossSol: number;
  remainingSol: number;
  theoreticalMaxVolumeSol: number;
  volumeMultiplier: number;
  creatorReinvestCycles: number;
  creatorReinvestedSwaps: number;
  creatorReinvestedVolumeSol: number;
  totalProjectedSwapsWithCreatorReinvest: number;
  totalProjectedVolumeWithCreatorReinvestSol: number;
  volumeMultiplierWithCreatorReinvest: number;
}

const DEFAULT_TX_FEE_SOL = 0.00005;
const MAX_CREATOR_REINVEST_CYCLES = 256;

interface SinglePassRunout {
  maxSwaps: number;
  projectedVolumeSol: number;
  creatorLossSol: number;
  protocolLossSol: number;
  lpLossSol: number;
  networkLossSol: number;
  totalLossSol: number;
  remainingSol: number;
}

export function estimateRunout(input: RunoutEstimateInput): RunoutEstimateOutput {
  const usableSol = sanitizeNonNegative(input.usableSol);
  const minSwapSol = sanitizeNonNegative(input.minSwapSol);
  const maxSwapSol = sanitizeNonNegative(input.maxSwapSol);
  const orderedMinSwap = Math.min(minSwapSol, maxSwapSol);
  const orderedMaxSwap = Math.max(minSwapSol, maxSwapSol);
  const avgSwapSol = (orderedMinSwap + orderedMaxSwap) / 2;
  const txFeeSol = sanitizeNonNegative(input.txFeeSol ?? DEFAULT_TX_FEE_SOL);

  const feeBps: FeeBpsBreakdown = {
    creatorFeeBps: sanitizeNonNegative(input.creatorFeeBps),
    protocolFeeBps: sanitizeNonNegative(input.protocolFeeBps),
    lpFeeBps: sanitizeNonNegative(input.lpFeeBps),
    totalFeeBps:
      sanitizeNonNegative(input.creatorFeeBps) +
      sanitizeNonNegative(input.protocolFeeBps) +
      sanitizeNonNegative(input.lpFeeBps),
  };

  const swapTradingLoss = avgSwapSol * (feeBps.totalFeeBps / 10_000);
  const lossPerSwapSol = swapTradingLoss + txFeeSol;
  const baseRun = runSinglePass({
    passCapitalSol: usableSol,
    avgSwapSol,
    txFeeSol,
    feeBps,
    lossPerSwapSol,
  });

  const creatorReinvest = projectCreatorReinvestedVolume({
    initialCreatorFeeSol: baseRun.creatorLossSol,
    avgSwapSol,
    txFeeSol,
    feeBps,
    lossPerSwapSol,
  });

  const totalProjectedSwapsWithCreatorReinvest = baseRun.maxSwaps + creatorReinvest.reinvestedSwaps;
  const totalProjectedVolumeWithCreatorReinvestSol =
    baseRun.projectedVolumeSol + creatorReinvest.reinvestedVolumeSol;

  const theoreticalMaxVolumeSol =
    usableSol <= 0 || feeBps.totalFeeBps <= 0
      ? 0
      : usableSol / (feeBps.totalFeeBps / 10_000);
  const volumeMultiplier = usableSol > 0 ? baseRun.projectedVolumeSol / usableSol : 0;
  const volumeMultiplierWithCreatorReinvest =
    usableSol > 0 ? totalProjectedVolumeWithCreatorReinvestSol / usableSol : 0;

  return {
    usableSol,
    avgSwapSol,
    txFeeSol,
    feeBps,
    lossPerSwapSol,
    maxSwaps: baseRun.maxSwaps,
    projectedVolumeSol: baseRun.projectedVolumeSol,
    creatorLossSol: baseRun.creatorLossSol,
    protocolLossSol: baseRun.protocolLossSol,
    lpLossSol: baseRun.lpLossSol,
    networkLossSol: baseRun.networkLossSol,
    totalLossSol: baseRun.totalLossSol,
    remainingSol: baseRun.remainingSol,
    theoreticalMaxVolumeSol,
    volumeMultiplier,
    creatorReinvestCycles: creatorReinvest.cycles,
    creatorReinvestedSwaps: creatorReinvest.reinvestedSwaps,
    creatorReinvestedVolumeSol: creatorReinvest.reinvestedVolumeSol,
    totalProjectedSwapsWithCreatorReinvest,
    totalProjectedVolumeWithCreatorReinvestSol,
    volumeMultiplierWithCreatorReinvest,
  };
}

function sanitizeNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

function runSinglePass(input: {
  passCapitalSol: number;
  avgSwapSol: number;
  txFeeSol: number;
  feeBps: FeeBpsBreakdown;
  lossPerSwapSol: number;
}): SinglePassRunout {
  const passCapitalSol = sanitizeNonNegative(input.passCapitalSol);
  const maxSwaps =
    passCapitalSol <= 0 || input.lossPerSwapSol <= 0
      ? 0
      : Math.floor(passCapitalSol / input.lossPerSwapSol);
  const projectedVolumeSol = maxSwaps * input.avgSwapSol;

  const creatorLossSol = projectedVolumeSol * (input.feeBps.creatorFeeBps / 10_000);
  const protocolLossSol = projectedVolumeSol * (input.feeBps.protocolFeeBps / 10_000);
  const lpLossSol = projectedVolumeSol * (input.feeBps.lpFeeBps / 10_000);
  const networkLossSol = maxSwaps * input.txFeeSol;
  const totalLossSol = creatorLossSol + protocolLossSol + lpLossSol + networkLossSol;
  const remainingSol = Math.max(0, passCapitalSol - totalLossSol);

  return {
    maxSwaps,
    projectedVolumeSol,
    creatorLossSol,
    protocolLossSol,
    lpLossSol,
    networkLossSol,
    totalLossSol,
    remainingSol,
  };
}

function projectCreatorReinvestedVolume(input: {
  initialCreatorFeeSol: number;
  avgSwapSol: number;
  txFeeSol: number;
  feeBps: FeeBpsBreakdown;
  lossPerSwapSol: number;
}): {
  cycles: number;
  reinvestedSwaps: number;
  reinvestedVolumeSol: number;
} {
  let reinvestCapitalSol = sanitizeNonNegative(input.initialCreatorFeeSol);
  let reinvestedSwaps = 0;
  let reinvestedVolumeSol = 0;
  let cycles = 0;

  for (let cycle = 0; cycle < MAX_CREATOR_REINVEST_CYCLES; cycle++) {
    if (reinvestCapitalSol <= 0) {
      break;
    }

    const run = runSinglePass({
      passCapitalSol: reinvestCapitalSol,
      avgSwapSol: input.avgSwapSol,
      txFeeSol: input.txFeeSol,
      feeBps: input.feeBps,
      lossPerSwapSol: input.lossPerSwapSol,
    });

    if (run.maxSwaps <= 0 || run.projectedVolumeSol <= 0) {
      break;
    }

    cycles += 1;
    reinvestedSwaps += run.maxSwaps;
    reinvestedVolumeSol += run.projectedVolumeSol;
    reinvestCapitalSol = run.creatorLossSol;
  }

  return {
    cycles,
    reinvestedSwaps,
    reinvestedVolumeSol,
  };
}
