/**
 * Auto-Sell Types - Sniper Guard for TrenchSniper OS
 */

/** Position status */
export type PositionStatus = 'open' | 'partial' | 'closed';

/** Trigger types */
export type TriggerType = 'take_profit' | 'stop_loss' | 'trailing_stop' | 'time_based' | 'manual';

/** Auto-sell configuration */
export interface AutoSellConfig {
  /** Target multiplier for take profit (e.g., 2 = 2x) */
  takeProfitMultiplier: number;
  /** Stop loss percentage from entry (e.g., 0.5 = 50% drop) */
  stopLossPercent: number;
  /** Enable trailing stop */
  trailingStopEnabled: boolean;
  /** Trailing stop percentage drop from peak (e.g., 0.2 = 20% drop) */
  trailingStopPercent: number;
  /** Enable time-based auto-sell */
  timeBasedEnabled: boolean;
  /** Time limit in minutes */
  timeLimitMinutes: number;
  /** Enable partial sells (DCA out) */
  partialSellsEnabled: boolean;
  /** Partial sell levels: [multiplier, percent_to_sell][] */
  partialSellLevels: Array<[number, number]>;
  /** Priority fee for sell transactions */
  priorityFeeLamports: number;
  /** Jito tip for MEV protection */
  jitoTipLamports: number;
  /** Max slippage for sells */
  maxSlippageBps: number;
}

/** Default auto-sell config */
export const DEFAULT_AUTOSELL_CONFIG: AutoSellConfig = {
  takeProfitMultiplier: 2.0,
  stopLossPercent: 0.5,
  trailingStopEnabled: true,
  trailingStopPercent: 0.2,
  timeBasedEnabled: false,
  timeLimitMinutes: 60,
  partialSellsEnabled: true,
  partialSellLevels: [
    [2.0, 0.25],
    [4.0, 0.50],
    [10.0, 1.0],
  ],
  priorityFeeLamports: 50000,
  jitoTipLamports: 0,
  maxSlippageBps: 100,
};

/** Position record */
export interface Position {
  id: string;
  tokenMint: string;
  tokenSymbol?: string;
  entryPrice: number;
  entrySolAmount: number;
  tokenAmount: number;
  remainingTokens: number;
  peakPrice: number;
  peakMultiplier: number;
  status: PositionStatus;
  openTime: number;
  entrySlot: number;
  entrySignature: string;
  exits: ExitRecord[];
  config: AutoSellConfig;
}

/** Exit/sell record */
export interface ExitRecord {
  type: TriggerType;
  timestamp: number;
  slot: number;
  signature: string;
  price: number;
  multiplier: number;
  tokensSold: number;
  solReceived: number;
  percentageOfPosition: number;
}

/** Active trigger */
export interface ActiveTrigger {
  type: TriggerType;
  triggerPrice: number;
  triggered: boolean;
  triggeredAt?: number;
  executed: boolean;
  executedAt?: number;
  signature?: string;
}

/** Price update */
export interface PriceUpdate {
  tokenMint: string;
  price: number;
  slot: number;
  timestamp: number;
  liquidityUsd?: number;
  volume24h?: number;
}

/** Sell order */
export interface SellOrder {
  positionId: string;
  tokenMint: string;
  tokenAmount: number;
  triggerType: TriggerType;
  targetPrice: number;
  expectedSol: number;
  slippageBps: number;
  priorityFee: number;
  jitoTip: number;
}

/** Sell result */
export interface SellResult {
  success: boolean;
  signature?: string;
  positionId: string;
  tokensSold: number;
  solReceived: number;
  price: number;
  multiplier: number;
  error?: string;
  timestamp: number;
  slot: number;
}

/** Guard event */
export interface GuardEvent {
  type: 'trigger_activated' | 'trigger_executed' | 'position_closed' | 'partial_exit' | 'trailing_adjusted';
  positionId: string;
  tokenMint: string;
  triggerType?: TriggerType;
  data: Record<string, unknown>;
  timestamp: number;
}

/** Guard stats */
export interface GuardStats {
  totalPositions: number;
  activePositions: number;
  positionsExited: number;
  averageHoldTimeMinutes: number;
  totalTriggersActivated: number;
  triggersByType: Record<TriggerType, number>;
}

/** Custom errors */
export class PositionNotFoundError extends Error {
  constructor(positionId: string) {
    super(`Position not found: ${positionId}`);
    this.name = 'PositionNotFoundError';
  }
}

export class TriggerAlreadyActiveError extends Error {
  constructor(positionId: string, triggerType: TriggerType) {
    super(`Trigger ${triggerType} already active for position ${positionId}`);
    this.name = 'TriggerAlreadyActiveError';
  }
}

export class SellExecutionError extends Error {
  constructor(message: string, public positionId?: string, public triggerType?: TriggerType) {
    super(message);
    this.name = 'SellExecutionError';
  }
}
