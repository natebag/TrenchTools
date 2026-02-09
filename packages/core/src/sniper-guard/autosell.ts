/**
 * AutoSell Engine - Take profit, stop loss, trailing stop + time-based sells
 * TrenchSniper OS v0.2.0
 */

import EventEmitter from 'events';
import { logger } from '../logger.js';
import type {
  Position,
  PriceUpdate,
  ActiveTrigger,
  TriggerType,
  GuardEvent,
} from './types.js';

/** AutoSell engine handles all position tracking and trigger logic */
export class AutoSellEngine extends EventEmitter {
  private positions = new Map<string, Position>();
  private activeTriggers = new Map<string, ActiveTrigger[]>();
  private priceHistory = new Map<string, PriceUpdate[]>();
  private readonly maxPriceHistory = 100;
  private paused = false;

  constructor() {
    super();
  }

  /** Register a new position with the engine */
  registerPosition(position: Position): void {
    this.positions.set(position.id, position);
    this.activeTriggers.set(position.id, []);
    this.priceHistory.set(position.id, []);

    this.emit('position:open', {
      type: 'trigger_activated',
      positionId: position.id,
      tokenMint: position.tokenMint,
      data: {},
      timestamp: Date.now(),
    } as GuardEvent);

    logger.info(`Position registered: ${position.tokenSymbol || position.tokenMint.substring(0, 8)} | Entry: ${position.entryPrice} SOL`);
  }

  /** Remove a position from tracking */
  removePosition(positionId: string): boolean {
    const deleted = this.positions.delete(positionId);
    this.activeTriggers.delete(positionId);
    this.priceHistory.delete(positionId);
    return deleted;
  }

  /** Update position with new price data */
  updatePrice(update: PriceUpdate): void {
    const position = this.findPositionByMint(update.tokenMint);
    if (!position) return;
    if (position.status === 'closed') return;

    // Update peak price if higher
    const currentMultiplier = update.price / position.entryPrice;
    if (currentMultiplier > position.peakMultiplier) {
      position.peakPrice = update.price;
      position.peakMultiplier = currentMultiplier;
      this.emit('peak:update', {
        positionId: position.id,
        peakMultiplier: position.peakMultiplier,
        timestamp: update.timestamp,
      });
    }

    // Store price history
    const history = this.priceHistory.get(position.id) || [];
    history.push(update);
    if (history.length > this.maxPriceHistory) history.shift();
    this.priceHistory.set(position.id, history);

    // Check triggers
    this.evaluateTriggers(position, update);
  }

  /** Evaluate all triggers for a position */
  private evaluateTriggers(position: Position, price: PriceUpdate): void {
    if (this.paused) return;
    if (position.status === 'closed') return;

    const config = position.config;
    const multiplier = price.price / position.entryPrice;
    const triggers = this.activeTriggers.get(position.id) || [];

    // Check take profit
    if (!triggers.find(t => t.type === 'take_profit' && !t.triggered)) {
      if (multiplier >= config.takeProfitMultiplier) {
        this.activateTrigger(position, 'take_profit', price.price);
      }
    }

    // Check stop loss
    if (!triggers.find(t => t.type === 'stop_loss' && !t.triggered)) {
      const stopLossMultiplier = 1 - config.stopLossPercent;
      if (multiplier <= stopLossMultiplier) {
        this.activateTrigger(position, 'stop_loss', price.price);
      }
    }

    // Check trailing stop
    if (config.trailingStopEnabled && !triggers.find(t => t.type === 'trailing_stop' && !t.triggered)) {
      this.checkTrailingStop(position, price);
    }

    // Check time-based
    if (config.timeBasedEnabled && !triggers.find(t => t.type === 'time_based' && !t.triggered)) {
      this.checkTimeBased(position, price);
    }

    // Check partial sells
    if (config.partialSellsEnabled) {
      this.checkPartialSells(position, price);
    }
  }

  /** Check trailing stop condition */
  private checkTrailingStop(position: Position, price: PriceUpdate): void {
    const config = position.config;
    const dropFromPeak = position.peakPrice - price.price;
    const dropPercent = dropFromPeak / position.peakPrice;

    if (position.peakMultiplier > 1.5 && dropPercent >= config.trailingStopPercent) {
      this.activateTrigger(position, 'trailing_stop', price.price);
      this.emit('trailing:activated', {
        positionId: position.id,
        peakPrice: position.peakPrice,
        currentPrice: price.price,
        dropPercent,
      });
    }
  }

  /** Check time-based condition */
  private checkTimeBased(position: Position, price: PriceUpdate): void {
    const config = position.config;
    const elapsedMinutes = (price.timestamp - position.openTime) / 60000;

    if (elapsedMinutes >= config.timeLimitMinutes) {
      this.activateTrigger(position, 'time_based', price.price);
    }
  }

  /** Check partial sell levels */
  private checkPartialSells(position: Position, price: PriceUpdate): void {
    const config = position.config;
    const multiplier = price.price / position.entryPrice;

    if (position.status === 'closed') return;

    for (const [levelMultiplier, sellPercent] of config.partialSellLevels) {
      const alreadyHit = position.exits.some(e => e.type === 'manual' && e.percentageOfPosition === sellPercent * 100);
      if (alreadyHit) continue;

      if (multiplier >= levelMultiplier) {
        const event: GuardEvent = {
          type: 'partial_exit',
          positionId: position.id,
          tokenMint: position.tokenMint,
          data: {
            levelMultiplier,
            sellPercent,
            currentPrice: price.price,
          },
          timestamp: price.timestamp,
        };
        this.emit('sell:partial', event);

        logger.info(`Partial sell triggered: ${position.tokenSymbol || position.tokenMint.substring(0, 8)} at ${multiplier.toFixed(2)}x`);
      }
    }
  }

  /** Activate a trigger */
  private activateTrigger(position: Position, type: TriggerType, triggerPrice: number): void {
    const triggers = this.activeTriggers.get(position.id) || [];

    if (triggers.some(t => t.type === type && !t.triggered)) {
      return;
    }

    const trigger: ActiveTrigger = {
      type,
      triggerPrice,
      triggered: true,
      triggeredAt: Date.now(),
      executed: false,
    };

    triggers.push(trigger);
    this.activeTriggers.set(position.id, triggers);

    const event: GuardEvent = {
      type: 'trigger_activated',
      positionId: position.id,
      tokenMint: position.tokenMint,
      triggerType: type,
      data: { triggerPrice },
      timestamp: trigger.triggeredAt || Date.now(),
    };
    this.emit('trigger:activated', event);

    logger.info(`🔫 TRIGGER ACTIVATED: ${type} for ${position.tokenSymbol || position.tokenMint.substring(0, 8)} at ${triggerPrice.toFixed(6)} SOL`);
  }

  /** Get all active (non-closed) positions */
  getActivePositions(): Position[] {
    return Array.from(this.positions.values()).filter(p => p.status !== 'closed');
  }

  /** Get position by ID */
  getPosition(id: string): Position | undefined {
    return this.positions.get(id);
  }

  /** Find position by token mint */
  findPositionByMint(mint: string): Position | undefined {
    return Array.from(this.positions.values()).find(p => p.tokenMint === mint && p.status !== 'closed');
  }

  /** Pause/resume the engine */
  pause(): void {
    this.paused = true;
    logger.info('🛑 AutoSellEngine PAUSED');
  }

  resume(): void {
    this.paused = false;
    logger.info('▶️ AutoSellEngine RESUMED');
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Get engine stats */
  getStats(): {
    positionsTracked: number;
    activePositions: number;
    triggersActive: number;
    paused: boolean;
  } {
    return {
      positionsTracked: this.positions.size,
      activePositions: this.getActivePositions().length,
      triggersActive: Array.from(this.activeTriggers.values()).flat().filter(t => t.triggered && !t.executed).length,
      paused: this.paused,
    };
  }
}
