/**
 * TrenchSniper Detection Module
 * Powered by Allium
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Provides manipulation detection for on-chain trading activity.
 * Uses Allium APIs for blockchain data queries.
 */

// ============ Core Exports ============

export { AlliumClient, AlliumError, AlliumRateLimitError } from './allium-client.js';
export { Analyzer, analyzeTransactions } from './analyzer.js';
export { Monitor, startMonitor, createMonitor, watchTokens, stopAllMonitors } from './monitor.js';

// ============ Pattern Detectors ============

export { 
  detectWalletClustering, 
  analyzeClusteringFromTransactions,
  getClusteringResult,
} from './patterns/clustering.js';

export { 
  detectIntervalRegularity,
  getAverageInterval,
  isWalletRegular,
} from './patterns/intervals.js';

export { 
  detectSizeDistribution,
  looksNatural,
  getMode,
} from './patterns/sizing.js';

export { 
  detectCoordinatedTiming,
  detectBurstActivity,
  getTimingDistribution,
  detectTimeConcentration,
} from './patterns/timing.js';

// ============ Types ============

export type {
  PatternType,
  Pattern,
  Evidence,
  Severity,
  Alert,
  AlertPriority,
  AnalysisReport,
  TransactionData,
  AlliumConfig,
  AlliumTokenPrice,
  AlliumWalletTransaction,
  AlliumBalanceHistory,
  AlliumQueryResult,
  MonitorConfig,
  MonitorStats,
  MonitorHandle,
  ClusteringResult,
  WalletCluster,
  DetectionEngineConfig,
} from './types.js';

// ============ Detection Engine Class ============

import { AlliumClient } from './allium-client.js';
import { Analyzer } from './analyzer.js';
import { startMonitor } from './monitor.js';
import type {
  DetectionEngineConfig,
  MonitorConfig,
  MonitorHandle,
  Alert,
  AnalysisReport,
  TransactionData,
} from './types.js';

/**
 * DetectionEngine - Main entry point for detection functionality
 * 
 * @example
 * ```typescript
 * const engine = new DetectionEngine({
 *   allium: {
 *     apiKey: process.env.ALLIUM_API_KEY!,
 *     queryId: process.env.ALLIUM_QUERY_ID,
 *   },
 * });
 * 
 * // Analyze a token
 * const report = await engine.analyzeToken('TokenMintAddress');
 * console.log(report.manipulationScore);
 * 
 * // Start monitoring
 * const handle = engine.monitor({
 *   tokenMint: 'TokenMintAddress',
 *   alertThreshold: 0.7,
 *   checkIntervalMs: 30000,
 *   lookbackMs: 3600000,
 * }, (alert) => {
 *   console.log('Alert!', alert);
 * });
 * 
 * // Later...
 * handle.stop();
 * ```
 */
export class DetectionEngine {
  private readonly alliumClient: AlliumClient;
  private readonly analyzer: Analyzer;
  private readonly monitors: Map<string, MonitorHandle> = new Map();

  constructor(config: DetectionEngineConfig) {
    this.alliumClient = new AlliumClient(config.allium);
    this.analyzer = new Analyzer(config);
  }

  /**
   * Analyze transactions for manipulation patterns
   */
  analyzeTransactions(transactions: TransactionData[]): AnalysisReport {
    return this.analyzer.analyzeTransactions(transactions);
  }

  /**
   * Fetch and analyze a token's trading activity
   */
  async analyzeToken(
    tokenMint: string,
    chain: string = 'solana',
    options?: { timeRangeMs?: number; limit?: number }
  ): Promise<AnalysisReport> {
    return this.analyzer.analyzeToken(tokenMint, chain, options);
  }

  /**
   * Start monitoring a token for manipulation
   */
  monitor(config: MonitorConfig, onAlert: (alert: Alert) => void): MonitorHandle {
    this.stopMonitor(config.tokenMint);

    const handle = startMonitor(this.alliumClient, this.analyzer, config, onAlert);
    this.monitors.set(config.tokenMint, handle);

    return {
      stop: () => {
        handle.stop();
        this.monitors.delete(config.tokenMint);
      },
      getStats: () => handle.getStats(),
      updateConfig: (newConfig) => handle.updateConfig(newConfig),
    };
  }

  /**
   * Stop monitoring a specific token
   */
  stopMonitor(tokenMint: string): void {
    const handle = this.monitors.get(tokenMint);
    if (handle) {
      handle.stop();
      this.monitors.delete(tokenMint);
    }
  }

  /**
   * Stop all active monitors
   */
  stopAllMonitors(): void {
    for (const handle of this.monitors.values()) {
      handle.stop();
    }
    this.monitors.clear();
  }

  /**
   * Get stats for all active monitors
   */
  getMonitorStats(): Map<string, ReturnType<MonitorHandle['getStats']>> {
    const stats = new Map();
    for (const [tokenMint, handle] of this.monitors) {
      stats.set(tokenMint, handle.getStats());
    }
    return stats;
  }

  /**
   * Get the underlying Allium client
   */
  getAlliumClient(): AlliumClient {
    return this.alliumClient;
  }

  /**
   * Get citation (required by Allium TOS)
   */
  getCitation(): string {
    return 'Powered by Allium';
  }
}

export default DetectionEngine;
