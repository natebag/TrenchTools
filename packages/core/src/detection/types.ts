/**
 * Detection Module Types
 * Powered by Allium
 * Integrated from Marketchoomba (@orbitmm/core)
 */

// ============ Pattern Types ============

export type PatternType =
  | 'wallet_clustering'
  | 'interval_regularity'
  | 'size_distribution'
  | 'coordinated_timing'
  | 'new_wallet_spam'
  | 'circular_trading'
  | 'wash_trading';

export type Severity = 'low' | 'medium' | 'high';

export interface Evidence {
  type: string;
  description: string;
  data: Record<string, unknown>;
}

export interface Pattern {
  type: PatternType;
  confidence: number; // 0.0 - 1.0
  severity: Severity;
  evidence: Evidence[];
  detectedAt: number;
}

// ============ Alert Types ============

export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  id: string;
  timestamp: number;
  priority: AlertPriority;
  token: {
    mint: string;
    symbol?: string;
  };
  patterns: Pattern[];
  confidence: number;
  recommendation: string;
  citation: 'Powered by Allium';
}

// ============ Analysis Types ============

export interface AnalysisReport {
  tokenMint: string;
  analyzedAt: number;
  transactionCount: number;
  timeRange: { start: number; end: number };
  patterns: Pattern[];
  overallConfidence: number;
  manipulationScore: number; // 0-100
  recommendation: string;
  citation: 'Powered by Allium';
}

export interface TransactionData {
  signature: string;
  timestamp: number;
  signer: string;
  amount: number; // In token units
  direction: 'buy' | 'sell';
  priceUsd?: number;
}

// ============ Allium Types ============

export interface AlliumConfig {
  apiKey: string;
  queryId?: string;
  baseUrl?: string;
  rateLimitMs?: number; // Default 1100ms (slightly over 1 req/second)
  maxRetries?: number;
}

export interface AlliumTokenPrice {
  chain: string;
  address: string;
  price: number;
  decimals: number;
  info?: {
    name: string;
    symbol: string;
  };
  attributes?: {
    price_diff_1d?: number;
    price_diff_pct_1d?: number;
    volume_usd_1d?: number;
  };
}

export interface AlliumWalletTransaction {
  hash: string;
  timestamp: string;
  from_address: string;
  to_address: string;
  value: string;
  token_address?: string;
  chain: string;
}

export interface AlliumBalanceHistory {
  timestamp: string;
  balance: string;
  token_address: string;
  chain: string;
}

export interface AlliumQueryResult {
  run_id: string;
  status: 'created' | 'queued' | 'running' | 'success' | 'failed';
  data?: unknown[];
  error?: string;
}

// ============ Monitor Types ============

export interface MonitorConfig {
  tokenMint: string;
  alertThreshold: number; // 0.0 - 1.0
  checkIntervalMs: number;
  lookbackMs: number; // How far back to analyze
  chain?: string;
}

export interface MonitorStats {
  running: boolean;
  startedAt: number;
  transactionsAnalyzed: number;
  alertsGenerated: number;
  lastAnalysis: number;
}

export interface MonitorHandle {
  stop(): void;
  getStats(): MonitorStats;
  updateConfig(config: Partial<MonitorConfig>): void;
}

// ============ Clustering Types ============

export interface ClusteringResult {
  clustered: boolean;
  clusters: WalletCluster[];
  confidence: number;
}

export interface WalletCluster {
  fundingSource: string;
  wallets: string[];
  totalVolume: number;
}

// ============ Detection Engine Types ============

export interface DetectionEngineConfig {
  allium: AlliumConfig;
  thresholds?: {
    intervalCoefficientOfVariation?: number; // Default 0.5
    coordinatedTimingWindowMs?: number; // Default 5000
    minClusterSize?: number; // Default 3
    uniformDistributionThreshold?: number; // Default 0.3
  };
}
