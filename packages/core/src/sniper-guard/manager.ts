/**
 * Sniper Guard Manager - Position tracking and trade execution
 * TrenchSniper OS v0.2.0
 */

import type { Connection } from '@solana/web3.js';
import { logger } from '../logger.js';
import type { SnipeResult } from '../trading/types.js';
import { AutoSellEngine } from './autosell.js';
import type {
  Position,
  ExitRecord,
  AutoSellConfig,
  SellOrder,
  SellResult,
  GuardEvent,
  PriceUpdate,
} from './types.js';
import {
  DEFAULT_AUTOSELL_CONFIG,
  PositionNotFoundError,
  SellExecutionError,
} from './types.js';

/** Position manager with execution capabilities */
export class SniperGuardManager {
  readonly engine: AutoSellEngine;
  private _connection: Connection;
  private _priorityFeeLamports: number;

  constructor(options: {
    connection: Connection;
    priorityFeeLamports?: number;
  }) {
    this.engine = new AutoSellEngine();
    this._connection = options.connection;
    this._priorityFeeLamports = options.priorityFeeLamports || 50000;
    this.setupEventListeners();
  }

  /** Setup event handlers */
  private setupEventListeners(): void {
    this.engine.on('trigger:activated', async (event: GuardEvent) => {
      if (!event.triggerType) return;
      logger.info(`🔔 Trigger activated: ${event.triggerType} for ${event.tokenMint}`);
      await this.executeTrigger(event.positionId, event.triggerType);
    });

    this.engine.on('sell:partial', async (event: GuardEvent) => {
      const data = event.data as { levelMultiplier: number; sellPercent: number };
      await this.executePartialSell(event.positionId, data.sellPercent);
    });
  }

  /** Create position from snipe result */
  createPosition(
    snipeResult: SnipeResult,
    entryPrice: number,
    tokenAmount: number,
    config: Partial<AutoSellConfig> = {}
  ): Position {
    const position: Position = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenMint: snipeResult.tokenMint,
      tokenSymbol: snipeResult.tokenSymbol,
      entryPrice,
      entrySolAmount: snipeResult.amountIn,
      tokenAmount: tokenAmount,
      remainingTokens: tokenAmount,
      peakPrice: entryPrice,
      peakMultiplier: 1,
      status: 'open',
      openTime: snipeResult.timestamp,
      entrySlot: snipeResult.slot || 0,
      entrySignature: snipeResult.signature || '',
      exits: [],
      config: {
        ...DEFAULT_AUTOSELL_CONFIG,
        ...config,
      },
    };

    this.engine.registerPosition(position);
    logger.info(`✅ Position created: ${position.tokenMint.substring(0, 8)} | Size: ${entryPrice.toFixed(4)} SOL`);

    return position;
  }

  /** Manually add a position (for external trades) */
  addPosition(params: {
    tokenMint: string;
    tokenSymbol?: string;
    entryPrice: number;
    entrySolAmount: number;
    tokenAmount: number;
    entrySignature: string;
    entrySlot?: number;
    config?: Partial<AutoSellConfig>;
  }): Position {
    const position: Position = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenMint: params.tokenMint,
      tokenSymbol: params.tokenSymbol,
      entryPrice: params.entryPrice,
      entrySolAmount: params.entrySolAmount,
      tokenAmount: params.tokenAmount,
      remainingTokens: params.tokenAmount,
      peakPrice: params.entryPrice,
      peakMultiplier: 1,
      status: 'open',
      openTime: Date.now(),
      entrySlot: params.entrySlot || 0,
      entrySignature: params.entrySignature,
      exits: [],
      config: {
        ...DEFAULT_AUTOSELL_CONFIG,
        ...(params.config || {}),
      },
    };

    this.engine.registerPosition(position);
    return position;
  }

  /** Execute a triggered sell */
  async executeTrigger(
    positionId: string,
    triggerType: 'take_profit' | 'stop_loss' | 'trailing_stop' | 'time_based' | 'manual',
    options?: {
      percentage?: number;
    }
  ): Promise<SellResult> {
    const position = this.engine.getPosition(positionId);
    if (!position) throw new PositionNotFoundError(positionId);

    const percentage = options?.percentage ?? 1.0;
    const tokensToSell = position.remainingTokens * percentage;

    position.status = percentage < 1.0 ? 'partial' : 'closed';

    const result = await this.executeSell({
      positionId,
      tokenMint: position.tokenMint,
      tokenAmount: tokensToSell,
      triggerType,
      targetPrice: this.engine.findPositionByMint(position.tokenMint)?.peakPrice || position.entryPrice,
      expectedSol: tokensToSell * (this.engine.findPositionByMint(position.tokenMint)?.peakPrice || position.entryPrice),
      slippageBps: position.config.maxSlippageBps,
      priorityFee: position.config.priorityFeeLamports,
      jitoTip: position.config.jitoTipLamports,
    });

    if (result.success) {
      const exit: ExitRecord = {
        type: triggerType,
        timestamp: Date.now(),
        slot: result.slot,
        signature: result.signature!,
        price: result.price,
        multiplier: result.multiplier,
        tokensSold: result.tokensSold,
        solReceived: result.solReceived,
        percentageOfPosition: percentage,
      };

      position.exits.push(exit);
      position.remainingTokens -= tokensToSell;

      if (position.remainingTokens <= 0) {
        position.status = 'closed';
        const closeEvent: GuardEvent = {
          type: 'position_closed',
          positionId: position.id,
          tokenMint: position.tokenMint,
          data: {
            exitCount: position.exits.length,
            totalSolReceived: position.exits.reduce((sum, e) => sum + e.solReceived, 0),
            totalMultiplier: result.multiplier,
          },
          timestamp: Date.now(),
        };
        this.engine.emit('position:closed', closeEvent);
      }

      logger.info(`✅ Sell executed: ${triggerType} | ${result.multiplier.toFixed(2)}x | ${result.solReceived.toFixed(4)} SOL`);
    } else {
      position.status = 'open';
      throw new SellExecutionError(result.error || 'Sell failed', positionId, triggerType);
    }

    return result;
  }

  /** Execute partial sell at a DCA level */
  async executePartialSell(positionId: string, sellPercent: number): Promise<SellResult> {
    return this.executeTrigger(positionId, 'manual', { percentage: sellPercent });
  }

  /** Execute manual sell */
  async manualSell(
    positionId: string,
    options?: {
      percentage?: number;
    }
  ): Promise<SellResult> {
    return this.executeTrigger(positionId, 'manual', options);
  }

  /** Close entire position (emergency exit) */
  async emergencyExit(positionId: string): Promise<SellResult> {
    return this.executeTrigger(positionId, 'manual', { percentage: 1.0 });
  }

  /** Update price for a position */
  updatePrice(update: PriceUpdate): void {
    this.engine.updatePrice(update);
  }

  /** Get position summary */
  getPositionSummary(positionId: string): {
    position: Position;
    currentMultiplier: number;
    unrealizedGainSol: number;
    unrealizedGainPercent: number;
  } | null {
    const position = this.engine.getPosition(positionId);
    if (!position) return null;

    const currentPrice = position.peakPrice;
    const currentMultiplier = currentPrice / position.entryPrice;
    const unrealizedGainSol = (currentPrice - position.entryPrice) * position.tokenAmount;
    const unrealizedGainPercent = (currentMultiplier - 1) * 100;

    return {
      position,
      currentMultiplier,
      unrealizedGainSol,
      unrealizedGainPercent,
    };
  }

  /** Private: execute the actual sell transaction */
  private async executeSell(order: SellOrder): Promise<SellResult> {
    // TODO: Integrate with actual DEX (Jupiter, Raydium, etc.)
    const pos = this.engine.getPosition(order.positionId);
    return {
      success: true,
      positionId: order.positionId,
      tokensSold: order.tokenAmount,
      solReceived: order.expectedSol,
      price: order.targetPrice,
      multiplier: pos ? order.targetPrice / pos.entryPrice : 1,
      timestamp: Date.now(),
      slot: 0,
      signature: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  /** Get all positions */
  getPositions(): Position[] {
    return this.engine.getActivePositions();
  }

  /** Get summary stats */
  getStats(): {
    positions: number;
    totalInvestedSol: number;
    totalRemainingTokens: number;
  } {
    const positions = this.getPositions();
    return {
      positions: positions.length,
      totalInvestedSol: positions.reduce((sum, p) => sum + p.entrySolAmount, 0),
      totalRemainingTokens: positions.reduce((sum, p) => sum + p.remainingTokens, 0),
    };
  }

  /** Get connection */
  get connection(): Connection {
    return this._connection;
  }

  /** Get priority fee */
  get priorityFeeLamports(): number {
    return this._priorityFeeLamports;
  }
}
