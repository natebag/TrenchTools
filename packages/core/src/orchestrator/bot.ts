/**
 * TrenchSniper Bot
 * Individual bot implementation with state machine and swap scheduling.
 * Integrated from Marketchoomba (@orbitmm/core)
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import {
  BotState,
  BotConfig,
  BotStats,
  BotSnapshot,
  BotEventData,
  SwapEventData,
  createDefaultBotStats,
  isValidStateTransition,
} from './types.js';

// ============ Constants ============

const MAX_ERRORS_STORED = 10;
const CONSECUTIVE_FAILURE_THRESHOLD = 5;

// ============ Bot Errors ============

export class BotAlreadyRunningError extends Error {
  constructor(botId: string) {
    super(`Bot ${botId} is already running`);
    this.name = 'BotAlreadyRunningError';
  }
}

export class BotNotRunningError extends Error {
  constructor(botId: string, state: BotState) {
    super(`Bot ${botId} is not running (current state: ${state})`);
    this.name = 'BotNotRunningError';
  }
}

export class InvalidStateTransitionError extends Error {
  constructor(botId: string, from: BotState, to: BotState) {
    super(`Invalid state transition for bot ${botId}: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

// ============ Bot Class ============

export interface BotOptions {
  /** Optional custom ID (uses wallet pubkey prefix if not provided) */
  id?: string;
  /** Initial state (for recovery) */
  initialState?: BotState;
  /** Initial stats (for recovery) */
  initialStats?: BotStats;
  /** Created at timestamp (for recovery) */
  createdAt?: number;
}

export class Bot extends EventEmitter {
  public readonly id: string;
  public readonly wallet: Keypair;
  public readonly createdAt: number;
  
  private _state: BotState;
  private _stats: BotStats;
  private _config: BotConfig;
  private _updatedAt: number;
  
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private eventSequence: number = 0;
  private swapsThisHour: number = 0;
  private hourStartTime: number = Date.now();

  constructor(wallet: Keypair, config: BotConfig, options: BotOptions = {}) {
    super();
    
    this.wallet = wallet;
    this._config = { ...config };
    this.id = options.id ?? wallet.publicKey.toString().slice(0, 8);
    this.createdAt = options.createdAt ?? Date.now();
    this._state = options.initialState ?? 'idle';
    this._stats = options.initialStats ?? createDefaultBotStats();
    this._updatedAt = Date.now();
  }

  // ============ Getters ============

  get state(): BotState {
    return this._state;
  }

  get stats(): BotStats {
    return { ...this._stats };
  }

  get config(): BotConfig {
    return { ...this._config };
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  // ============ State Machine ============

  private setState(newState: BotState, reason?: string): void {
    const previousState = this._state;
    
    if (!isValidStateTransition(previousState, newState)) {
      if (previousState === newState) return;
      if (previousState === 'stopped') return;
      
      throw new InvalidStateTransitionError(this.id, previousState, newState);
    }
    
    this._state = newState;
    this._updatedAt = Date.now();
    
    this.emitEvent('state:changed', {
      botId: this.id,
      state: newState,
      previousState,
      reason,
      timestamp: Date.now(),
    } as BotEventData);
  }

  // ============ Lifecycle Methods ============

  start(): void {
    if (this._state === 'running') {
      return;
    }
    
    if (this._state !== 'idle' && this._state !== 'error') {
      throw new BotNotRunningError(this.id, this._state);
    }
    
    this.setState('starting');
    this._stats.startedAt = Date.now();
    
    setImmediate(() => {
      if (this._state === 'starting') {
        this.setState('running');
        this.emitEvent('bot:started', {
          botId: this.id,
          state: 'running',
          timestamp: Date.now(),
        } as BotEventData);
        this.scheduleNextSwap();
      }
    });
  }

  pause(): void {
    if (this._state !== 'running') {
      return;
    }
    
    this.clearTimer();
    this.setState('paused');
    
    this.emitEvent('bot:paused', {
      botId: this.id,
      state: 'paused',
      timestamp: Date.now(),
    } as BotEventData);
  }

  resume(): void {
    if (this._state !== 'paused') {
      return;
    }
    
    this.setState('running');
    this.emitEvent('bot:resumed', {
      botId: this.id,
      state: 'running',
      timestamp: Date.now(),
    } as BotEventData);
    this.scheduleNextSwap();
  }

  stop(): void {
    if (this._state === 'stopped') {
      return;
    }
    
    this.clearTimer();
    
    if (this._state === 'running' || this._state === 'paused') {
      this.setState('stopping');
    }
    
    this._state = 'stopped';
    this._updatedAt = Date.now();
    
    this.emitEvent('bot:stopped', {
      botId: this.id,
      state: 'stopped',
      timestamp: Date.now(),
    } as BotEventData);
  }

  updateConfig(config: Partial<BotConfig>): void {
    this._config = { ...this._config, ...config };
    this._updatedAt = Date.now();
    
    this.emitEvent('config:updated', {
      botId: this.id,
      config: this._config,
      timestamp: Date.now(),
    });
  }

  // ============ Snapshot ============

  getSnapshot(): BotSnapshot {
    return {
      id: this.id,
      walletPublicKey: this.wallet.publicKey.toString(),
      state: this._state,
      config: { ...this._config },
      stats: { ...this._stats },
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  // ============ Swap Scheduling ============

  private scheduleNextSwap(): void {
    if (this._state !== 'running') {
      return;
    }
    
    this.resetHourlyCounterIfNeeded();
    if (this._config.maxSwapsPerHour && this.swapsThisHour >= this._config.maxSwapsPerHour) {
      const msUntilNextHour = 3600000 - (Date.now() - this.hourStartTime);
      this.timer = setTimeout(() => {
        this.resetHourlyCounterIfNeeded();
        this.scheduleNextSwap();
      }, msUntilNextHour);
      return;
    }
    
    if (this._config.stopAfterSwaps && this._stats.swapsSuccessful >= this._config.stopAfterSwaps) {
      this.stop();
      return;
    }
    
    if (this._config.maxTotalVolumeSol && this._stats.totalVolumeSol >= this._config.maxTotalVolumeSol) {
      this.stop();
      return;
    }
    
    const delay = this.randomInterval();
    this.timer = setTimeout(() => this.executeSwap(), delay);
  }

  private resetHourlyCounterIfNeeded(): void {
    const now = Date.now();
    if (now - this.hourStartTime >= 3600000) {
      this.swapsThisHour = 0;
      this.hourStartTime = now;
    }
  }

  private async executeSwap(): Promise<void> {
    if (this._state !== 'running') {
      return;
    }
    
    const amount = this.randomAmount();
    const direction = this.selectDirection();
    
    const swapData: SwapEventData = {
      botId: this.id,
      wallet: this.wallet.publicKey.toString(),
      token: this._config.targetToken,
      direction,
      amountSol: amount,
      timestamp: Date.now(),
    };
    
    this._stats.swapsAttempted++;
    this.emitEvent('swap:initiated', swapData);
    
    try {
      this.emit('swap:execute', {
        ...swapData,
        wallet: this.wallet,
        token: new PublicKey(this._config.targetToken),
      });
      
    } catch (error) {
      this.recordSwapFailure(amount, direction, error as Error);
    }
    
    this.scheduleNextSwap();
  }

  // ============ Swap Result Recording ============

  recordSwapSuccess(
    amountSol: number,
    direction: 'buy' | 'sell',
    signature: string,
    tokenAmount: number
  ): void {
    this._stats.swapsSuccessful++;
    this._stats.totalVolumeSol += amountSol;
    this._stats.lastSwapAt = Date.now();
    this.swapsThisHour++;
    this.consecutiveFailures = 0;
    
    if (direction === 'buy') {
      this._stats.totalTokensBought += tokenAmount;
    } else {
      this._stats.totalTokensSold += tokenAmount;
    }
    
    this._updatedAt = Date.now();
    
    this.emitEvent('swap:completed', {
      botId: this.id,
      wallet: this.wallet.publicKey.toString(),
      token: this._config.targetToken,
      direction,
      amountSol,
      signature,
      timestamp: Date.now(),
    } as SwapEventData);
  }

  recordSwapFailure(
    amountSol: number,
    direction: 'buy' | 'sell',
    error: Error
  ): void {
    this._stats.swapsFailed++;
    this._stats.errors.push(error.message);
    
    if (this._stats.errors.length > MAX_ERRORS_STORED) {
      this._stats.errors = this._stats.errors.slice(-MAX_ERRORS_STORED);
    }
    
    this._updatedAt = Date.now();
    this.consecutiveFailures++;
    
    this.emitEvent('swap:failed', {
      botId: this.id,
      wallet: this.wallet.publicKey.toString(),
      token: this._config.targetToken,
      direction,
      amountSol,
      error: error.message,
      timestamp: Date.now(),
    } as SwapEventData);
    
    if (this.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
      this.transitionToError(`${CONSECUTIVE_FAILURE_THRESHOLD} consecutive swap failures`);
    }
    
    if (this.isPermanentError(error)) {
      this.transitionToError(`Permanent error: ${error.message}`);
    }
  }

  private transitionToError(reason: string): void {
    this.clearTimer();
    this._state = 'error';
    this._updatedAt = Date.now();
    
    this.emitEvent('bot:error', {
      botId: this.id,
      state: 'error',
      reason,
      timestamp: Date.now(),
    } as BotEventData);
  }

  private isPermanentError(error: Error): boolean {
    const permanentErrors = [
      'insufficient funds',
      'insufficient balance',
      'account not found',
      'invalid signature',
    ];
    
    const message = error.message.toLowerCase();
    return permanentErrors.some(pe => message.includes(pe));
  }

  // ============ Helper Methods ============

  private randomInterval(): number {
    const { minIntervalMs, maxIntervalMs } = this._config;
    return Math.floor(Math.random() * (maxIntervalMs - minIntervalMs) + minIntervalMs);
  }

  private randomAmount(): number {
    const { minSwapSol, maxSwapSol } = this._config;
    return Math.random() * (maxSwapSol - minSwapSol) + minSwapSol;
  }

  private selectDirection(): 'buy' | 'sell' {
    if (this._config.direction !== 'both') {
      return this._config.direction;
    }
    return Math.random() > 0.5 ? 'buy' : 'sell';
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emitEvent(event: string, data: unknown): void {
    this.emit(event, {
      ...(data as object),
      _seq: this.eventSequence++,
      _ts: Date.now(),
      _botId: this.id,
    });
  }

  destroy(): void {
    this.clearTimer();
    this.removeAllListeners();
  }
}

// ============ Factory Function ============

export function createBot(
  wallet: Keypair,
  config: BotConfig,
  options?: BotOptions
): Bot {
  return new Bot(wallet, config, options);
}
