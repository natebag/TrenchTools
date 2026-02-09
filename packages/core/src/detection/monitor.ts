/**
 * Detection Monitor
 * Real-time monitoring loop for token manipulation detection
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import { EventEmitter } from 'events';
import type { AlliumClient } from './allium-client.js';
import type {
  MonitorConfig,
  MonitorStats,
  MonitorHandle,
  Alert,
  TransactionData,
  Pattern,
  AlertPriority,
} from './types.js';
import { Analyzer } from './analyzer.js';

// ============ Monitor Implementation ============

export class Monitor extends EventEmitter {
  private readonly alliumClient: AlliumClient;
  private readonly analyzer: Analyzer;
  private config: MonitorConfig;
  private stats: MonitorStats;
  private intervalId: NodeJS.Timeout | null = null;
  private transactionBuffer: TransactionData[] = [];
  private lastProcessedTimestamp: number = 0;
  private alertCounter: number = 0;

  constructor(
    alliumClient: AlliumClient,
    analyzer: Analyzer,
    config: MonitorConfig
  ) {
    super();
    this.alliumClient = alliumClient;
    this.analyzer = analyzer;
    this.config = config;
    this.stats = {
      running: false,
      startedAt: 0,
      transactionsAnalyzed: 0,
      alertsGenerated: 0,
      lastAnalysis: 0,
    };
  }

  start(): void {
    if (this.stats.running) {
      console.warn('Monitor already running');
      return;
    }

    this.stats.running = true;
    this.stats.startedAt = Date.now();
    this.lastProcessedTimestamp = Date.now() - this.config.lookbackMs;

    this.runAnalysisCycle();

    this.intervalId = setInterval(
      () => this.runAnalysisCycle(),
      this.config.checkIntervalMs
    );

    this.emit('started', { tokenMint: this.config.tokenMint });
  }

  stop(): void {
    if (!this.stats.running) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.stats.running = false;
    this.emit('stopped', { tokenMint: this.config.tokenMint });
  }

  getStats(): MonitorStats {
    return { ...this.stats };
  }

  updateConfig(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.checkIntervalMs && this.stats.running) {
      this.stop();
      this.start();
    }
  }

  private async runAnalysisCycle(): Promise<void> {
    try {
      const newTransactions = await this.fetchNewTransactions();

      if (newTransactions.length === 0) {
        this.stats.lastAnalysis = Date.now();
        return;
      }

      this.addToBuffer(newTransactions);
      this.pruneBuffer();

      const report = this.analyzer.analyzeTransactions(this.transactionBuffer);

      this.stats.transactionsAnalyzed += newTransactions.length;
      this.stats.lastAnalysis = Date.now();

      this.emit('analysis', report);

      if (report.overallConfidence >= this.config.alertThreshold) {
        const alert = this.createAlert(report.patterns, report.overallConfidence);
        this.emitAlert(alert);
      }
    } catch (error) {
      console.error('Monitor analysis cycle failed:', error);
      this.emit('error', error);
    }
  }

  private async fetchNewTransactions(): Promise<TransactionData[]> {
    // const chain = this.config.chain ?? 'solana'; // Reserved for future multi-chain support
    
    const sql = `
      SELECT 
        signature,
        block_time as timestamp,
        signer,
        amount,
        CASE WHEN buyer = signer THEN 'buy' ELSE 'sell' END as direction
      FROM solana.dex.trades
      WHERE token_mint = '${this.config.tokenMint}'
        AND block_time > TO_TIMESTAMP(${Math.floor(this.lastProcessedTimestamp / 1000)})
      ORDER BY block_time ASC
      LIMIT 500
    `;

    try {
      const result = await this.alliumClient.runQuery(sql);

      if (result.status !== 'success' || !result.data) {
        return [];
      }

      const transactions = this.parseTransactions(result.data);

      if (transactions.length > 0) {
        this.lastProcessedTimestamp = Math.max(
          ...transactions.map(tx => tx.timestamp)
        );
      }

      return transactions;
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      return [];
    }
  }

  private parseTransactions(data: unknown[]): TransactionData[] {
    return data.map((row: any) => ({
      signature: row.signature ?? row.hash ?? '',
      timestamp: typeof row.timestamp === 'string'
        ? new Date(row.timestamp).getTime()
        : row.timestamp,
      signer: row.signer ?? row.from_address ?? '',
      amount: parseFloat(row.amount) || 0,
      direction: row.direction === 'buy' ? 'buy' : 'sell',
      priceUsd: row.price_usd ? parseFloat(row.price_usd) : undefined,
    }));
  }

  private addToBuffer(transactions: TransactionData[]): void {
    this.transactionBuffer.push(...transactions);
    this.transactionBuffer.sort((a, b) => a.timestamp - b.timestamp);
  }

  private pruneBuffer(): void {
    const cutoff = Date.now() - this.config.lookbackMs;
    this.transactionBuffer = this.transactionBuffer.filter(
      tx => tx.timestamp >= cutoff
    );
  }

  private createAlert(patterns: Pattern[], confidence: number): Alert {
    const priority = this.determinePriority(confidence, patterns);
    const recommendation = this.generateAlertRecommendation(patterns, priority);

    return {
      id: `alert-${Date.now()}-${++this.alertCounter}`,
      timestamp: Date.now(),
      priority,
      token: {
        mint: this.config.tokenMint,
      },
      patterns,
      confidence,
      recommendation,
      citation: 'Powered by Allium',
    };
  }

  private determinePriority(confidence: number, patterns: Pattern[]): AlertPriority {
    const hasHighSeverity = patterns.some(p => p.severity === 'high');
    const patternCount = patterns.length;

    if (confidence >= 0.9 || (confidence >= 0.8 && hasHighSeverity)) {
      return 'critical';
    }

    if (confidence >= 0.7 || (confidence >= 0.6 && patternCount >= 3)) {
      return 'high';
    }

    if (confidence >= 0.5) {
      return 'medium';
    }

    return 'low';
  }

  private generateAlertRecommendation(patterns: Pattern[], priority: AlertPriority): string {
    const patternTypes = patterns.map(p => p.type);

    const recommendations: string[] = [];

    if (patternTypes.includes('wallet_clustering')) {
      recommendations.push('Multiple wallets appear connected - possible coordinated activity');
    }

    if (patternTypes.includes('interval_regularity')) {
      recommendations.push('Trading intervals are too regular for human behavior');
    }

    if (patternTypes.includes('coordinated_timing')) {
      recommendations.push('Multiple wallets trading in tight time windows');
    }

    if (patternTypes.includes('size_distribution')) {
      recommendations.push('Transaction sizes follow unnatural patterns');
    }

    const actionByPriority: Record<AlertPriority, string> = {
      critical: 'IMMEDIATE ACTION: Consider exiting position immediately.',
      high: 'HIGH PRIORITY: Review position and consider reducing exposure.',
      medium: 'ATTENTION: Monitor closely and prepare contingency plan.',
      low: 'ADVISORY: Keep watching for escalation.',
    };

    return `${recommendations.join('. ')}. ${actionByPriority[priority]}`;
  }

  private emitAlert(alert: Alert): void {
    this.stats.alertsGenerated++;
    this.emit('alert', alert);
  }
}

// ============ Factory Function ============

export function startMonitor(
  alliumClient: AlliumClient,
  analyzer: Analyzer,
  config: MonitorConfig,
  onAlert: (alert: Alert) => void
): MonitorHandle {
  const monitor = new Monitor(alliumClient, analyzer, config);

  monitor.on('alert', onAlert);
  monitor.start();

  return {
    stop: () => monitor.stop(),
    getStats: () => monitor.getStats(),
    updateConfig: (newConfig) => monitor.updateConfig(newConfig),
  };
}

export function createMonitor(
  alliumClient: AlliumClient,
  analyzer: Analyzer,
  config: MonitorConfig
): Monitor {
  return new Monitor(alliumClient, analyzer, config);
}

export function watchTokens(
  alliumClient: AlliumClient,
  analyzer: Analyzer,
  tokens: MonitorConfig[],
  onAlert: (alert: Alert) => void
): Map<string, MonitorHandle> {
  const handles = new Map<string, MonitorHandle>();

  for (const config of tokens) {
    const handle = startMonitor(alliumClient, analyzer, config, onAlert);
    handles.set(config.tokenMint, handle);
  }

  return handles;
}

export function stopAllMonitors(handles: Map<string, MonitorHandle>): void {
  for (const handle of handles.values()) {
    handle.stop();
  }
  handles.clear();
}
