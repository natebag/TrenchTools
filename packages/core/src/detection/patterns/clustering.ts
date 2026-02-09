/**
 * Wallet Clustering Detection
 * Detects wallets funded from the same source - indicative of coordinated activity
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import type { AlliumClient } from '../allium-client.js';
import type { Pattern, Evidence, WalletCluster, ClusteringResult, TransactionData } from '../types.js';

interface FundingSource {
  wallet: string;
  fundingSources: string[];
  firstFundingTimestamp?: number;
}

/**
 * Detect wallet clustering by analyzing funding sources
 */
export async function detectWalletClustering(
  alliumClient: AlliumClient,
  wallets: string[],
  chain: string = 'solana',
  minClusterSize: number = 3
): Promise<Pattern | null> {
  if (wallets.length < minClusterSize) {
    return null;
  }

  const fundingSources: FundingSource[] = [];
  
  for (const wallet of wallets) {
    try {
      const history = await alliumClient.getWalletBalanceHistory(chain, wallet);
      const sources = extractFundingSources(history, wallet);
      fundingSources.push(sources);
    } catch (error) {
      console.warn(`Failed to get funding history for ${wallet}:`, error);
    }
  }

  const clusters = findClusters(fundingSources, minClusterSize);

  if (clusters.length === 0) {
    return null;
  }

  const confidence = calculateClusteringConfidence(clusters, wallets.length);
  const evidence = generateClusteringEvidence(clusters);

  return {
    type: 'wallet_clustering',
    confidence,
    severity: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    evidence,
    detectedAt: Date.now(),
  };
}

/**
 * Analyze clustering from pre-fetched transaction data
 */
export function analyzeClusteringFromTransactions(
  transactions: TransactionData[],
  fundingData: Map<string, string[]>,
  minClusterSize: number = 3
): Pattern | null {
  const wallets = [...new Set(transactions.map(tx => tx.signer))];
  
  if (wallets.length < minClusterSize) {
    return null;
  }

  const fundingSources: FundingSource[] = wallets.map(wallet => ({
    wallet,
    fundingSources: fundingData.get(wallet) ?? [],
  }));

  const clusters = findClusters(fundingSources, minClusterSize);

  if (clusters.length === 0) {
    return null;
  }

  const confidence = calculateClusteringConfidence(clusters, wallets.length);
  const evidence = generateClusteringEvidence(clusters);

  return {
    type: 'wallet_clustering',
    confidence,
    severity: confidence > 0.7 ? 'high' : confidence > 0.4 ? 'medium' : 'low',
    evidence,
    detectedAt: Date.now(),
  };
}

function extractFundingSources(
  history: { timestamp: string; balance: string; token_address: string }[],
  wallet: string
): FundingSource {
  const sources: string[] = [];
  let firstFundingTimestamp: number | undefined;
  
  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (let i = 1; i < sorted.length; i++) {
    const prev = parseFloat(sorted[i - 1].balance);
    const curr = parseFloat(sorted[i].balance);
    
    if (curr > prev) {
      if (!firstFundingTimestamp) {
        firstFundingTimestamp = new Date(sorted[i].timestamp).getTime();
      }
    }
  }

  return {
    wallet,
    fundingSources: sources,
    firstFundingTimestamp,
  };
}

function findClusters(
  fundingSources: FundingSource[],
  minClusterSize: number
): WalletCluster[] {
  const sourceToWallets: Map<string, string[]> = new Map();

  for (const fs of fundingSources) {
    for (const source of fs.fundingSources) {
      const existing = sourceToWallets.get(source) ?? [];
      existing.push(fs.wallet);
      sourceToWallets.set(source, existing);
    }
  }

  const clusters: WalletCluster[] = [];

  for (const [source, wallets] of sourceToWallets) {
    if (wallets.length >= minClusterSize) {
      clusters.push({
        fundingSource: source,
        wallets,
        totalVolume: 0,
      });
    }
  }

  const timingClusters = detectTimingClusters(fundingSources, minClusterSize);
  clusters.push(...timingClusters);

  return clusters;
}

function detectTimingClusters(
  fundingSources: FundingSource[],
  minClusterSize: number,
  windowMs: number = 300_000
): WalletCluster[] {
  const withTimestamp = fundingSources.filter(fs => fs.firstFundingTimestamp);
  withTimestamp.sort((a, b) => (a.firstFundingTimestamp ?? 0) - (b.firstFundingTimestamp ?? 0));

  const clusters: WalletCluster[] = [];
  let currentCluster: string[] = [];
  let windowStart = 0;

  for (const fs of withTimestamp) {
    const timestamp = fs.firstFundingTimestamp ?? 0;
    
    if (currentCluster.length === 0) {
      currentCluster.push(fs.wallet);
      windowStart = timestamp;
    } else if (timestamp - windowStart <= windowMs) {
      currentCluster.push(fs.wallet);
    } else {
      if (currentCluster.length >= minClusterSize) {
        clusters.push({
          fundingSource: 'timing_cluster',
          wallets: [...currentCluster],
          totalVolume: 0,
        });
      }
      currentCluster = [fs.wallet];
      windowStart = timestamp;
    }
  }

  if (currentCluster.length >= minClusterSize) {
    clusters.push({
      fundingSource: 'timing_cluster',
      wallets: [...currentCluster],
      totalVolume: 0,
    });
  }

  return clusters;
}

function calculateClusteringConfidence(
  clusters: WalletCluster[],
  totalWallets: number
): number {
  if (clusters.length === 0) return 0;

  const walletsInClusters = new Set(clusters.flatMap(c => c.wallets)).size;
  const clusterCoverage = walletsInClusters / totalWallets;

  const maxClusterSize = Math.max(...clusters.map(c => c.wallets.length));
  const clusterSizeScore = Math.min(1, maxClusterSize / 10);

  const clusterCountScore = Math.min(1, clusters.length / 5);

  const confidence = (
    clusterCoverage * 0.4 +
    clusterSizeScore * 0.4 +
    clusterCountScore * 0.2
  );

  return Math.min(1, confidence);
}

function generateClusteringEvidence(clusters: WalletCluster[]): Evidence[] {
  return clusters.map((cluster, index) => ({
    type: 'wallet_cluster',
    description: `Cluster of ${cluster.wallets.length} wallets with common funding source`,
    data: {
      clusterId: index,
      fundingSource: cluster.fundingSource,
      walletCount: cluster.wallets.length,
      wallets: cluster.wallets.slice(0, 10),
      moreWallets: cluster.wallets.length > 10 ? cluster.wallets.length - 10 : 0,
    },
  }));
}

export async function getClusteringResult(
  alliumClient: AlliumClient,
  wallets: string[],
  chain: string = 'solana',
  minClusterSize: number = 3
): Promise<ClusteringResult> {
  const pattern = await detectWalletClustering(alliumClient, wallets, chain, minClusterSize);
  
  if (!pattern) {
    return {
      clustered: false,
      clusters: [],
      confidence: 0,
    };
  }

  const clusters = pattern.evidence
    .filter(e => e.type === 'wallet_cluster')
    .map(e => ({
      fundingSource: e.data.fundingSource as string,
      wallets: e.data.wallets as string[],
      totalVolume: 0,
    }));

  return {
    clustered: true,
    clusters,
    confidence: pattern.confidence,
  };
}
