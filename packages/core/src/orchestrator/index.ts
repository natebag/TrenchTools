/**
 * TrenchSniper Orchestrator Module
 * 
 * Bot orchestration system for coordinated trading operations.
 * Supports up to 1000+ concurrent bots with pause/resume and crash recovery.
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * @module orchestrator
 */

// ============ Types ============

export type {
  BotState,
  BotConfig,
  BotStats,
  BotSnapshot,
  OrchestratorConfig,
  OrchestratorStats,
  WALEntry,
  WALEntryType,
  OrchestratorSnapshot,
  OrchestratorEvent,
  SwapEventData,
  BotEventData,
  RPCEndpoint,
  RPCPoolConfig,
  RPCPoolStrategy,
} from './types.js';

export {
  createDefaultBotStats,
  createDefaultOrchestratorConfig,
  isValidStateTransition,
} from './types.js';

// ============ Bot ============

export type { BotOptions } from './bot.js';

export {
  Bot,
  createBot,
  BotAlreadyRunningError,
  BotNotRunningError,
  InvalidStateTransitionError,
} from './bot.js';

// ============ Manager ============

export type { BotManagerConfig } from './manager.js';

export {
  BotManager,
  createOrchestrator,
} from './manager.js';

// ============ Scheduler ============

export type { SchedulerConfig } from './scheduler.js';

export {
  Semaphore,
  RateLimiter,
  CircuitBreaker,
  CircuitBreakerOpenError,
  RPCPool,
  NoHealthyEndpointsError,
  SwapScheduler,
  calculateBackoff,
  retryWithBackoff,
} from './scheduler.js';

// ============ Persistence ============

export type {
  WALManagerConfig,
  SnapshotManagerConfig,
  PersistenceConfig,
  RecoveryResult,
} from './persistence.js';

export {
  WALManager,
  SnapshotManager,
  PersistenceManager,
  createWALEntry,
  verifyWALEntry,
} from './persistence.js';

// ============ Main Orchestrator Class ============

import { Keypair } from '@solana/web3.js';
import { BotManager, createOrchestrator } from './manager.js';
import { BotConfig, OrchestratorStats, BotSnapshot, OrchestratorConfig } from './types.js';
import { Bot } from './bot.js';

/**
 * Main Orchestrator class - high-level API for bot orchestration.
 * 
 * @example
 * ```typescript
 * const orchestrator = await Orchestrator.create({
 *   maxConcurrentSwaps: 50,
 *   rpcEndpoints: ['https://api.mainnet-beta.solana.com'],
 * });
 * 
 * // Create bots
 * const bots = orchestrator.createBots(wallets, {
 *   targetToken: 'So11111111111111111111111111111111111111112',
 *   direction: 'both',
 *   minSwapSol: 0.01,
 *   maxSwapSol: 0.1,
 *   minIntervalMs: 30000,
 *   maxIntervalMs: 120000,
 * });
 * 
 * // Start all bots
 * orchestrator.startAll();
 * 
 * // Monitor events
 * orchestrator.on('swap:completed', (data) => {
 *   console.log(`Bot ${data.botId} completed swap: ${data.signature}`);
 * });
 * 
 * // Graceful shutdown
 * await orchestrator.shutdown();
 * ```
 */
export class Orchestrator {
  private manager: BotManager;

  private constructor(manager: BotManager) {
    this.manager = manager;
  }

  static async create(config?: Partial<OrchestratorConfig>): Promise<Orchestrator> {
    const manager = await createOrchestrator(config);
    manager.start();
    return new Orchestrator(manager);
  }

  // ============ Bot Management ============

  createBots(wallets: Keypair[], config: BotConfig): Bot[] {
    return this.manager.createBots(wallets, config);
  }

  createBot(wallet: Keypair, config: BotConfig): Bot {
    return this.manager.createBot(wallet, config);
  }

  getBot(botId: string): Bot | undefined {
    return this.manager.getBot(botId);
  }

  getAllBots(): Bot[] {
    return this.manager.getAllBots();
  }

  getBotSnapshots(): BotSnapshot[] {
    return this.manager.getBots();
  }

  // ============ Bot Control ============

  startBots(botIds: string[]): void {
    this.manager.startBots(botIds);
  }

  startAll(): void {
    this.manager.startAll();
  }

  pauseBots(botIds: string[]): void {
    this.manager.pauseBots(botIds);
  }

  pauseAll(): void {
    this.manager.pauseAll();
  }

  resumeBots(botIds: string[]): void {
    this.manager.resumeBots(botIds);
  }

  resumeAll(): void {
    this.manager.resumeAll();
  }

  stopBots(botIds: string[]): void {
    this.manager.stopBots(botIds);
  }

  stopAll(): void {
    this.manager.stopAll();
  }

  // ============ Advanced Operations ============

  mergeBots(botIds: string[]): Bot | null {
    return this.manager.mergeBots(botIds);
  }

  splitBot(botId: string): [Bot, Bot] | null {
    return this.manager.splitBot(botId);
  }

  removeBot(botId: string): boolean {
    return this.manager.removeBot(botId);
  }

  // ============ Statistics ============

  getStats(): OrchestratorStats {
    return this.manager.getStats();
  }

  getSchedulerStats(): ReturnType<BotManager['getSchedulerStats']> {
    return this.manager.getSchedulerStats();
  }

  // ============ Events ============

  on(event: string, handler: (...args: unknown[]) => void): this {
    this.manager.on(event, handler);
    return this;
  }

  off(event: string, handler: (...args: unknown[]) => void): this {
    this.manager.off(event, handler);
    return this;
  }

  once(event: string, handler: (...args: unknown[]) => void): this {
    this.manager.once(event, handler);
    return this;
  }

  // ============ Persistence ============

  createSnapshot(): void {
    this.manager.createSnapshot();
  }

  // ============ Lifecycle ============

  async shutdown(): Promise<void> {
    await this.manager.shutdown();
  }
}
