/**
 * Interval Regularity Detection
 * Detects bot-like timing patterns through statistical analysis
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import type { Pattern, Evidence, TransactionData } from '../types.js';

interface IntervalStats {
  mean: number;
  stdDev: number;
  coefficientOfVariation: number;
  intervals: number[];
  sampleSize: number;
}

/**
 * Detect interval regularity in transaction timing
 */
export function detectIntervalRegularity(
  transactions: TransactionData[],
  cvThreshold: number = 0.5,
  minTransactions: number = 5
): Pattern | null {
  if (transactions.length < minTransactions) {
    return null;
  }

  const walletPatterns = analyzeByWallet(transactions, cvThreshold, minTransactions);
  
  const overallStats = calculateIntervalStats(
    transactions.sort((a, b) => a.timestamp - b.timestamp)
  );

  const regularWallets = walletPatterns.filter(p => p.isRegular);
  
  if (regularWallets.length === 0 && (!overallStats || overallStats.coefficientOfVariation >= cvThreshold)) {
    return null;
  }

  const confidence = calculateIntervalConfidence(
    regularWallets.length,
    walletPatterns.length,
    overallStats?.coefficientOfVariation ?? 1
  );

  const evidence = generateIntervalEvidence(regularWallets, overallStats);

  return {
    type: 'interval_regularity',
    confidence,
    severity: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    evidence,
    detectedAt: Date.now(),
  };
}

function analyzeByWallet(
  transactions: TransactionData[],
  cvThreshold: number,
  minTransactions: number
): { wallet: string; stats: IntervalStats; isRegular: boolean }[] {
  const byWallet: Map<string, TransactionData[]> = new Map();
  
  for (const tx of transactions) {
    const existing = byWallet.get(tx.signer) ?? [];
    existing.push(tx);
    byWallet.set(tx.signer, existing);
  }

  const results: { wallet: string; stats: IntervalStats; isRegular: boolean }[] = [];

  for (const [wallet, txs] of byWallet) {
    if (txs.length < minTransactions) continue;

    const sorted = txs.sort((a, b) => a.timestamp - b.timestamp);
    const stats = calculateIntervalStats(sorted);
    
    if (stats) {
      results.push({
        wallet,
        stats,
        isRegular: stats.coefficientOfVariation < cvThreshold,
      });
    }
  }

  return results;
}

function calculateIntervalStats(transactions: TransactionData[]): IntervalStats | null {
  if (transactions.length < 2) {
    return null;
  }

  const intervals: number[] = [];
  for (let i = 1; i < transactions.length; i++) {
    const interval = transactions[i].timestamp - transactions[i - 1].timestamp;
    if (interval > 0) {
      intervals.push(interval);
    }
  }

  if (intervals.length < 2) {
    return null;
  }

  const sum = intervals.reduce((a, b) => a + b, 0);
  const mean = sum / intervals.length;

  const squaredDiffs = intervals.map(i => Math.pow(i - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  const coefficientOfVariation = mean > 0 ? stdDev / mean : Infinity;

  return {
    mean,
    stdDev,
    coefficientOfVariation,
    intervals,
    sampleSize: intervals.length,
  };
}

function calculateIntervalConfidence(
  regularWalletCount: number,
  totalWalletCount: number,
  overallCV: number
): number {
  if (totalWalletCount === 0) return 0;

  const walletRegularityScore = regularWalletCount / totalWalletCount;
  const overallRegularityScore = Math.max(0, 1 - overallCV);
  const sampleSizeScore = Math.min(1, totalWalletCount / 10);

  const confidence = (
    walletRegularityScore * 0.5 +
    overallRegularityScore * 0.3 +
    sampleSizeScore * 0.2
  );

  return Math.min(1, Math.max(0, confidence));
}

function generateIntervalEvidence(
  regularWallets: { wallet: string; stats: IntervalStats }[],
  overallStats: IntervalStats | null
): Evidence[] {
  const evidence: Evidence[] = [];

  if (overallStats && overallStats.coefficientOfVariation < 1) {
    evidence.push({
      type: 'interval_overall',
      description: `Overall transaction timing shows ${overallStats.coefficientOfVariation < 0.5 ? 'regular' : 'semi-regular'} patterns`,
      data: {
        meanIntervalMs: Math.round(overallStats.mean),
        meanIntervalSeconds: Math.round(overallStats.mean / 1000),
        standardDeviationMs: Math.round(overallStats.stdDev),
        coefficientOfVariation: overallStats.coefficientOfVariation.toFixed(3),
        sampleSize: overallStats.sampleSize,
        interpretation: interpretCV(overallStats.coefficientOfVariation),
      },
    });
  }

  const topRegular = regularWallets
    .sort((a, b) => a.stats.coefficientOfVariation - b.stats.coefficientOfVariation)
    .slice(0, 5);

  for (const { wallet, stats } of topRegular) {
    evidence.push({
      type: 'interval_wallet',
      description: `Wallet ${wallet.slice(0, 8)}... trades at regular intervals`,
      data: {
        wallet,
        meanIntervalMs: Math.round(stats.mean),
        meanIntervalSeconds: Math.round(stats.mean / 1000),
        coefficientOfVariation: stats.coefficientOfVariation.toFixed(3),
        transactionCount: stats.sampleSize + 1,
        interpretation: interpretCV(stats.coefficientOfVariation),
      },
    });
  }

  return evidence;
}

function interpretCV(cv: number): string {
  if (cv < 0.1) return 'Extremely regular - almost certainly automated';
  if (cv < 0.3) return 'Very regular - likely automated';
  if (cv < 0.5) return 'Regular - possibly automated';
  if (cv < 0.7) return 'Semi-regular - could be human or bot';
  if (cv < 1.0) return 'Irregular - likely human';
  return 'Random - natural human behavior';
}

export function getAverageInterval(transactions: TransactionData[]): number | null {
  const sorted = transactions.sort((a, b) => a.timestamp - b.timestamp);
  const stats = calculateIntervalStats(sorted);
  return stats?.mean ?? null;
}

export function isWalletRegular(
  transactions: TransactionData[],
  cvThreshold: number = 0.5
): { isRegular: boolean; stats: IntervalStats | null } {
  const sorted = transactions.sort((a, b) => a.timestamp - b.timestamp);
  const stats = calculateIntervalStats(sorted);
  
  if (!stats) {
    return { isRegular: false, stats: null };
  }

  return {
    isRegular: stats.coefficientOfVariation < cvThreshold,
    stats,
  };
}
