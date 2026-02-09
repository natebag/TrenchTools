/**
 * TrenchSniper Bot Manager
 * Manages bot lifecycle, creation, and coordination.
 * Integrated from Marketchoomba (@orbitmm/core)
 */

import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  BotConfig,
  BotSnapshot,
  OrchestratorConfig,
  OrchestratorStats,
  SwapEventData,
  BotEventData,
  createDefaultOrchestratorConfig,
} from './types.js';
import { Bot, createBot } from './bot.js';
import { SwapScheduler, SchedulerConfig } from './scheduler.js';
import { PersistenceManager, PersistenceConfig } from './persistence.js';

// ============ Bot Manager ============

export interface BotManagerConfig extends OrchestratorConfig {}

export class BotManager extends EventEmitter {
  private bots: Map<string, Bot> = new Map();
  private scheduler: SwapScheduler;
  private persistence: PersistenceManager;
  private startTime: number;
  private config: BotManagerConfig;
  private totalSwapsExecuted: number = 0;
  private totalVolumeSol: number = 0;

  constructor(config: Partial<BotManagerConfig> = {}) {
    super();
    
    this.config = {
      ...createDefaultOrchestratorConfig(),
      ...config,
    };
    
    this.startTime = Date.now();
    
    const schedulerConfig: SchedulerConfig = {
      maxConcurrentSwaps: this.config.maxConcurrentSwaps,
      rpcPoolConfig: {
        endpoints: this.config.rpcEndpoints.map(url => ({
          url,
          weight: 1,
          rateLimit: 40,
        })),
        strategy: 'least-loaded',
        healthCheckIntervalMs: 30000,
        requestTimeoutMs: 10000,
      },
    };
    
    this.scheduler = new SwapScheduler(schedulerConfig);
    
    const persistenceConfig: PersistenceConfig = {
      enabled: this.config.persistence.enabled,
      walPath: this.config.persistence.walPath,
      snapshotDir: this.config.persistence.walPath.replace('.wal', '-snapshots'),
      snapshotIntervalMs: this.config.persistence.snapshotIntervalMs,
    };
    
    this.persistence = new PersistenceManager(persistenceConfig);
  }

  // ============ Bot Creation ============

  createBots(wallets: Keypair[], config: BotConfig): Bot[] {
    const createdBots: Bot[] = [];
    
    for (const wallet of wallets) {
      const mergedConfig = { ...this.config.defaultBotConfig, ...config } as BotConfig;
      const bot = createBot(wallet, mergedConfig);
      
      this.setupBotListeners(bot);
      this.bots.set(bot.id, bot);
      createdBots.push(bot);
      
      this.persistence.logEvent('bot_created', bot.getSnapshot());
      
      this.emit('bot:created', {
        botId: bot.id,
        state: bot.state,
        timestamp: Date.now(),
      } as BotEventData);
    }
    
    return createdBots;
  }

  createBot(wallet: Keypair, config: BotConfig): Bot {
    return this.createBots([wallet], config)[0];
  }

  private setupBotListeners(bot: Bot): void {
    bot.on('bot:started', (data: BotEventData) => {
      this.persistence.logEvent('bot_started', data);
      this.emit('bot:started', data);
    });
    
    bot.on('bot:paused', (data: BotEventData) => {
      this.persistence.logEvent('bot_paused', data);
      this.emit('bot:paused', data);
    });
    
    bot.on('bot:resumed', (data: BotEventData) => {
      this.persistence.logEvent('bot_resumed', data);
      this.emit('bot:resumed', data);
    });
    
    bot.on('bot:stopped', (data: BotEventData) => {
      this.persistence.logEvent('bot_stopped', data);
      this.emit('bot:stopped', data);
    });
    
    bot.on('bot:error', (data: BotEventData) => {
      this.persistence.logEvent('bot_error', data);
      this.emit('bot:error', data);
    });
    
    bot.on('swap:initiated', (data: SwapEventData) => {
      this.persistence.logEvent('swap_initiated', data);
      this.emit('swap:initiated', data);
    });
    
    bot.on('swap:execute', async (data: {
      botId: string;
      wallet: Keypair;
      token: PublicKey;
      amountSol: number;
      direction: 'buy' | 'sell';
    }) => {
      await this.executeSwap(bot, data);
    });
  }

  private async executeSwap(
    bot: Bot,
    data: {
      wallet: Keypair;
      token: PublicKey;
      amountSol: number;
      direction: 'buy' | 'sell';
    }
  ): Promise<void> {
    try {
      const result = await this.scheduler.scheduleSwap(async (connection) => {
        return this.simulateSwap(connection, data);
      });
      
      bot.recordSwapSuccess(
        data.amountSol,
        data.direction,
        result.signature,
        result.tokenAmount
      );
      
      this.totalSwapsExecuted++;
      this.totalVolumeSol += data.amountSol;
      
      this.persistence.logEvent('swap_completed', {
        botId: bot.id,
        wallet: data.wallet.publicKey.toString(),
        token: data.token.toString(),
        direction: data.direction,
        amountSol: data.amountSol,
        signature: result.signature,
        timestamp: Date.now(),
      });
      
      this.emit('swap:completed', {
        botId: bot.id,
        wallet: data.wallet.publicKey.toString(),
        token: data.token.toString(),
        direction: data.direction,
        amountSol: data.amountSol,
        signature: result.signature,
        timestamp: Date.now(),
      } as SwapEventData);
      
    } catch (error) {
      bot.recordSwapFailure(
        data.amountSol,
        data.direction,
        error as Error
      );
      
      this.persistence.logEvent('swap_failed', {
        botId: bot.id,
        wallet: data.wallet.publicKey.toString(),
        token: data.token.toString(),
        direction: data.direction,
        amountSol: data.amountSol,
        error: (error as Error).message,
        timestamp: Date.now(),
      });
      
      this.emit('swap:failed', {
        botId: bot.id,
        wallet: data.wallet.publicKey.toString(),
        token: data.token.toString(),
        direction: data.direction,
        amountSol: data.amountSol,
        error: (error as Error).message,
        timestamp: Date.now(),
      } as SwapEventData);
    }
  }

  private async simulateSwap(
    _connection: Connection,
    data: { amountSol: number; direction: 'buy' | 'sell' }
  ): Promise<{ signature: string; tokenAmount: number }> {
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    
    if (Math.random() < 0.05) {
      throw new Error('Simulated swap failure');
    }
    
    return {
      signature: `sim_${randomUUID().slice(0, 16)}`,
      tokenAmount: data.amountSol * (1000 + Math.random() * 100),
    };
  }

  // ============ Bot Control ============

  startBots(botIds: string[]): void {
    for (const id of botIds) {
      const bot = this.bots.get(id);
      if (bot) {
        bot.start();
      }
    }
  }

  startAll(): void {
    for (const bot of this.bots.values()) {
      if (bot.state === 'idle' || bot.state === 'error') {
        bot.start();
      }
    }
  }

  pauseBots(botIds: string[]): void {
    for (const id of botIds) {
      const bot = this.bots.get(id);
      if (bot) {
        bot.pause();
      }
    }
  }

  pauseAll(): void {
    for (const bot of this.bots.values()) {
      if (bot.state === 'running') {
        bot.pause();
      }
    }
  }

  resumeBots(botIds: string[]): void {
    for (const id of botIds) {
      const bot = this.bots.get(id);
      if (bot) {
        bot.resume();
      }
    }
  }

  resumeAll(): void {
    for (const bot of this.bots.values()) {
      if (bot.state === 'paused') {
        bot.resume();
      }
    }
  }

  stopBots(botIds: string[]): void {
    for (const id of botIds) {
      const bot = this.bots.get(id);
      if (bot) {
        bot.stop();
      }
    }
  }

  stopAll(): void {
    for (const bot of this.bots.values()) {
      if (bot.state !== 'stopped') {
        bot.stop();
      }
    }
  }

  // ============ Bot Operations ============

  mergeBots(botIds: string[]): Bot | null {
    if (botIds.length < 2) {
      return null;
    }
    
    const botsToMerge: Bot[] = [];
    for (const id of botIds) {
      const bot = this.bots.get(id);
      if (bot) {
        botsToMerge.push(bot);
      }
    }
    
    if (botsToMerge.length < 2) {
      return null;
    }
    
    const config = botsToMerge[0].config;
    
    for (const bot of botsToMerge) {
      bot.stop();
      bot.destroy();
      this.bots.delete(bot.id);
    }
    
    const newBot = createBot(botsToMerge[0].wallet, config);
    this.setupBotListeners(newBot);
    this.bots.set(newBot.id, newBot);
    
    this.persistence.logEvent('bot_created', {
      ...newBot.getSnapshot(),
      mergedFrom: botIds,
    });
    
    return newBot;
  }

  splitBot(botId: string): [Bot, Bot] | null {
    const originalBot = this.bots.get(botId);
    if (!originalBot) {
      return null;
    }
    
    const newKeypair = Keypair.generate();
    const config = originalBot.config;
    
    const splitConfig: BotConfig = {
      ...config,
      maxTotalVolumeSol: config.maxTotalVolumeSol 
        ? config.maxTotalVolumeSol / 2 
        : undefined,
      stopAfterSwaps: config.stopAfterSwaps 
        ? Math.floor(config.stopAfterSwaps / 2) 
        : undefined,
    };
    
    originalBot.updateConfig(splitConfig);
    
    const newBot = createBot(newKeypair, splitConfig);
    this.setupBotListeners(newBot);
    this.bots.set(newBot.id, newBot);
    
    this.persistence.logEvent('bot_created', {
      ...newBot.getSnapshot(),
      splitFrom: botId,
    });
    
    return [originalBot, newBot];
  }

  removeBot(botId: string): boolean {
    const bot = this.bots.get(botId);
    if (!bot) {
      return false;
    }
    
    if (bot.state !== 'stopped') {
      bot.stop();
    }
    
    bot.destroy();
    return this.bots.delete(botId);
  }

  // ============ Queries ============

  getBot(botId: string): Bot | undefined {
    return this.bots.get(botId);
  }

  getAllBots(): Bot[] {
    return Array.from(this.bots.values());
  }

  getBots(): BotSnapshot[] {
    return Array.from(this.bots.values()).map(bot => bot.getSnapshot());
  }

  getStats(): OrchestratorStats {
    const bots = Array.from(this.bots.values());
    
    return {
      totalBots: bots.length,
      activeBots: bots.filter(b => b.state === 'running').length,
      pausedBots: bots.filter(b => b.state === 'paused').length,
      stoppedBots: bots.filter(b => b.state === 'stopped').length,
      errorBots: bots.filter(b => b.state === 'error').length,
      totalSwapsExecuted: this.totalSwapsExecuted,
      totalVolumeSol: this.totalVolumeSol,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  getSchedulerStats(): ReturnType<SwapScheduler['getStats']> {
    return this.scheduler.getStats();
  }

  // ============ Recovery ============

  async recover(): Promise<{
    botsRecovered: number;
    pausedForReview: string[];
  }> {
    const result = this.persistence.recover();
    
    for (const snapshot of result.bots) {
      console.log(`Would restore bot ${snapshot.id} (needs keypair)`);
    }
    
    this.emit('orchestrator:recovered', {
      botsRecovered: result.bots.length,
      walEntriesReplayed: result.walEntriesReplayed,
      pausedForReview: result.pausedForReview,
    });
    
    return {
      botsRecovered: result.bots.length,
      pausedForReview: result.pausedForReview,
    };
  }

  createSnapshot(): void {
    this.persistence.createSnapshot(
      this.getBots(),
      this.getStats()
    );
  }

  // ============ Lifecycle ============

  start(): void {
    this.persistence.startPeriodicSnapshots(() => ({
      bots: this.getBots(),
      stats: this.getStats(),
    }));
    
    this.emit('orchestrator:started', {
      timestamp: Date.now(),
    });
  }

  async shutdown(): Promise<void> {
    this.stopAll();
    this.createSnapshot();
    this.persistence.shutdown();
    this.scheduler.shutdown();
    
    for (const bot of this.bots.values()) {
      bot.destroy();
    }
    this.bots.clear();
    
    this.emit('orchestrator:stopped', {
      timestamp: Date.now(),
    });
  }
}

// ============ Factory Function ============

export async function createOrchestrator(
  config?: Partial<BotManagerConfig>
): Promise<BotManager> {
  const manager = new BotManager(config);
  
  if (config?.persistence?.enabled) {
    await manager.recover();
  }
  
  return manager;
}
