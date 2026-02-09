/**
 * Size Distribution Detection
 * Detects unnatural transaction size patterns
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import type { Pattern, Evidence, TransactionData } from '../types.js';

interface SizeStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  skewness: number;
  kurtosis: number;
  uniqueSizes: number;
  totalTransactions: number;
  distribution: 'power_law' | 'uniform' | 'modal' | 'bimodal' | 'unknown';
}

/**
 * Detect unnatural size distribution patterns
 */
export function detectSizeDistribution(
  transactions: TransactionData[],
  uniformThreshold: number = 0.3
): Pattern | null {
  if (transactions.length < 10) {
    return null;
  }

  const amounts = transactions.map(tx => tx.amount).filter(a => a > 0);
  if (amounts.length < 10) {
    return null;
  }

  const stats = calculateSizeStats(amounts);
  const issues = detectSuspiciousPatterns(stats, amounts, uniformThreshold);

  if (issues.length === 0) {
    return null;
  }

  const confidence = calculateSizeConfidence(issues, stats);
  const evidence = generateSizeEvidence(stats, issues);

  return {
    type: 'size_distribution',
    confidence,
    severity: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    evidence,
    detectedAt: Date.now(),
  };
}

function calculateSizeStats(amounts: number[]): SizeStats {
  const sorted = [...amounts].sort((a, b) => a - b);
  const n = amounts.length;

  const min = sorted[0];
  const max = sorted[n - 1];
  const sum = amounts.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const squaredDiffs = amounts.map(a => Math.pow(a - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(variance);

  const cubedDiffs = amounts.map(a => Math.pow((a - mean) / stdDev, 3));
  const skewness = cubedDiffs.reduce((a, b) => a + b, 0) / n;

  const fourthDiffs = amounts.map(a => Math.pow((a - mean) / stdDev, 4));
  const kurtosis = fourthDiffs.reduce((a, b) => a + b, 0) / n - 3;

  const precision = Math.pow(10, -Math.floor(Math.log10(mean)) + 2);
  const rounded = amounts.map(a => Math.round(a * precision) / precision);
  const uniqueSizes = new Set(rounded).size;

  const baseStats: Omit<SizeStats, 'distribution'> = {
    min,
    max,
    mean,
    median,
    stdDev,
    skewness,
    kurtosis,
    uniqueSizes,
    totalTransactions: n,
  };

  const distribution = classifyDistribution({...baseStats, distribution: 'unknown'});

  return {
    ...baseStats,
    distribution,
  };
}

function classifyDistribution(stats: Omit<SizeStats, 'distribution'> & { distribution: string }): SizeStats['distribution'] {
  const { skewness, kurtosis, uniqueSizes, totalTransactions, stdDev, mean } = stats;
  
  const cv = mean > 0 ? stdDev / mean : 0;
  const uniquenessRatio = uniqueSizes / totalTransactions;

  if (uniquenessRatio < 0.05) {
    return 'modal';
  }

  if (cv < 0.15 && Math.abs(skewness) < 0.5) {
    return 'uniform';
  }

  if (skewness > 2 && kurtosis > 3) {
    return 'power_law';
  }

  if (kurtosis < -1) {
    return 'bimodal';
  }

  return 'unknown';
}

function detectSuspiciousPatterns(
  stats: SizeStats,
  amounts: number[],
  uniformThreshold: number
): string[] {
  const issues: string[] = [];

  const cv = stats.mean > 0 ? stats.stdDev / stats.mean : 0;
  if (cv < uniformThreshold) {
    issues.push('uniform_sizing');
  }

  const uniquenessRatio = stats.uniqueSizes / stats.totalTransactions;
  if (uniquenessRatio < 0.1) {
    issues.push('modal_sizing');
  }

  const roundNumberRatio = countRoundNumbers(amounts);
  if (roundNumberRatio > 0.7) {
    issues.push('round_numbers');
  }

  const repetitionRate = findRepetitionRate(amounts);
  if (repetitionRate > 0.5) {
    issues.push('repeating_amounts');
  }

  if (stats.distribution === 'bimodal') {
    issues.push('bimodal_distribution');
  }

  return issues;
}

function countRoundNumbers(amounts: number[]): number {
  const roundAmounts = amounts.filter(a => {
    const significand = a / Math.pow(10, Math.floor(Math.log10(a)));
    return significand === 1 || significand === 5 || significand === 2;
  });

  return roundAmounts.length / amounts.length;
}

function findRepetitionRate(amounts: number[]): number {
  const precision = Math.pow(10, 6);
  const rounded = amounts.map(a => Math.round(a * precision) / precision);
  
  const counts = new Map<number, number>();
  for (const a of rounded) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }

  let repeatedCount = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      repeatedCount += count;
    }
  }

  return repeatedCount / amounts.length;
}

function calculateSizeConfidence(issues: string[], stats: SizeStats): number {
  if (issues.length === 0) return 0;

  const issueWeights: Record<string, number> = {
    'uniform_sizing': 0.4,
    'modal_sizing': 0.3,
    'round_numbers': 0.2,
    'repeating_amounts': 0.35,
    'bimodal_distribution': 0.25,
  };

  let confidence = 0;
  for (const issue of issues) {
    confidence += issueWeights[issue] ?? 0.2;
  }

  const sampleSizeMultiplier = Math.min(1, stats.totalTransactions / 50);
  confidence *= sampleSizeMultiplier;

  if (stats.distribution === 'uniform' || stats.distribution === 'modal') {
    confidence += 0.1;
  }

  return Math.min(1, confidence);
}

function generateSizeEvidence(stats: SizeStats, issues: string[]): Evidence[] {
  const evidence: Evidence[] = [];

  evidence.push({
    type: 'size_statistics',
    description: `Transaction size analysis (${stats.totalTransactions} transactions)`,
    data: {
      min: stats.min.toFixed(6),
      max: stats.max.toFixed(6),
      mean: stats.mean.toFixed(6),
      median: stats.median.toFixed(6),
      stdDev: stats.stdDev.toFixed(6),
      uniqueSizes: stats.uniqueSizes,
      distribution: stats.distribution,
      coefficientOfVariation: (stats.stdDev / stats.mean).toFixed(3),
    },
  });

  for (const issue of issues) {
    evidence.push({
      type: 'size_anomaly',
      description: getIssueDescription(issue),
      data: {
        issue,
        severity: getIssueSeverity(issue),
      },
    });
  }

  return evidence;
}

function getIssueDescription(issue: string): string {
  const descriptions: Record<string, string> = {
    'uniform_sizing': 'Transaction sizes are unusually uniform - not typical of human trading',
    'modal_sizing': 'Very few distinct transaction sizes used - suggests automated trading',
    'round_numbers': 'Majority of transactions use round numbers - common in bot trading',
    'repeating_amounts': 'Same amounts repeat frequently - typical of automated systems',
    'bimodal_distribution': 'Two distinct clusters of transaction sizes detected',
  };

  return descriptions[issue] ?? 'Unusual size pattern detected';
}

function getIssueSeverity(issue: string): string {
  const severities: Record<string, string> = {
    'uniform_sizing': 'high',
    'modal_sizing': 'medium',
    'round_numbers': 'low',
    'repeating_amounts': 'medium',
    'bimodal_distribution': 'low',
  };

  return severities[issue] ?? 'medium';
}

export function looksNatural(amounts: number[]): boolean {
  if (amounts.length < 10) return true;

  const stats = calculateSizeStats(amounts);
  
  return stats.skewness > 1 && stats.distribution !== 'uniform' && stats.distribution !== 'modal';
}

export function getMode(amounts: number[]): { value: number; count: number; percentage: number } | null {
  if (amounts.length === 0) return null;

  const precision = Math.pow(10, 6);
  const rounded = amounts.map(a => Math.round(a * precision) / precision);
  
  const counts = new Map<number, number>();
  for (const a of rounded) {
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }

  let maxCount = 0;
  let modeValue = 0;

  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }

  return {
    value: modeValue,
    count: maxCount,
    percentage: (maxCount / amounts.length) * 100,
  };
}
