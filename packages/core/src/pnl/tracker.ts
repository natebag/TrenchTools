/**
 * P&L Tracker - Track trades and positions
 */
import type {
  Trade, PositionPnL, PnLReport, DailyPnL, PnLFilter,
} from './types.js';
import { PnLCalculator } from './calculator.js';

export class PnLTracker {
  private trades: Map<string, Trade> = new Map();
  private positions: Map<string, PositionPnL> = new Map();
  private tokenPrices: Map<string, number> = new Map();

  /** Record a trade */
  recordTrade(trade: Trade): void {
    this.trades.set(trade.id, trade);
    this.updatePositionFromTrade(trade);
  }

  /** Update token price */
  updatePrice(tokenMint: string, price: number): void {
    this.tokenPrices.set(tokenMint, price);
    // Recalculate open positions
    for (const [id, position] of this.positions) {
      if (position.tokenMint === tokenMint && position.status === 'open') {
        const updated = PnLCalculator.calculatePositionPnL(
          tokenMint,
          position.trades,
          price
        );
        this.positions.set(id, updated);
      }
    }
  }

  /** Get position for token in wallet */
  private getPositionId(tokenMint: string, walletAddress: string): string {
    return `${tokenMint}-${walletAddress}`;
  }

  /** Update position when trade happens */
  private updatePositionFromTrade(trade: Trade): void {
    const positionId = this.getPositionId(trade.tokenMint, trade.walletAddress);
    const existing = this.positions.get(positionId);

    const trades = existing ? [...existing.trades, trade] : [trade];
    const currentPrice = this.tokenPrices.get(trade.tokenMint) || trade.price;

    const position = PnLCalculator.calculatePositionPnL(
      trade.tokenMint,
      trades,
      currentPrice
    );

    this.positions.set(positionId, position);
  }

  /** Get position by ID */
  getPosition(positionId: string): PositionPnL | undefined {
    return this.positions.get(positionId);
  }

  /** Get all positions for a token */
  getTokenPositions(tokenMint: string): PositionPnL[] {
    return Array.from(this.positions.values()).filter(p => p.tokenMint === tokenMint);
  }

  /** Get all positions for a wallet */
  getWalletPositions(walletAddress: string): PositionPnL[] {
    return Array.from(this.positions.values()).filter(p => p.walletAddress === walletAddress);
  }

  /** Get all open positions */
  getOpenPositions(): PositionPnL[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'open');
  }

  /** Get all closed positions */
  getClosedPositions(): PositionPnL[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'closed');
  }

  /** Generate P&L report */
  generateReport(filter?: PnLFilter): PnLReport {
    const now = Date.now();
    const startTime = filter?.startTime || Math.min(...Array.from(this.trades.values()).map(t => t.timestamp)) || now;
    const endTime = filter?.endTime || now;

    let positions = Array.from(this.positions.values());
    let trades = Array.from(this.trades.values());

    // Apply filters
    if (filter?.tokenMints?.length) {
      positions = positions.filter(p => filter.tokenMints!.includes(p.tokenMint));
      trades = trades.filter(t => filter.tokenMints!.includes(t.tokenMint));
    }
    if (filter?.walletAddresses?.length) {
      positions = positions.filter(p => filter.walletAddresses!.includes(p.walletAddress));
      trades = trades.filter(t => filter.walletAddresses!.includes(t.walletAddress));
    }

    const buys = trades.filter(t => t.side === 'buy');
    const sells = trades.filter(t => t.side === 'sell');
    const totalSolSpent = buys.reduce((s, t) => s + t.solAmount, 0);
    const totalSolReceived = sells.reduce((s, t) => s + t.solAmount, 0);

    const closed = positions.filter(p => p.status === 'closed');
    const open = positions.filter(p => p.status === 'open');

    const realizedPnLSol = closed.reduce((s, p) => s + p.realizedPnLSol, 0);
    const unrealizedPnLSol = open.reduce((s, p) => s + p.unrealizedPnLSol, 0);

    const wins = closed.filter(p => p.realizedPnLSol > 0);
    const losses = closed.filter(p => p.realizedPnLSol < 0);

    // Calculate token summaries
    const tokenMap = new Map<string, PositionPnL[]>();
    for (const pos of positions) {
      const list = tokenMap.get(pos.tokenMint) || [];
      list.push(pos);
      tokenMap.set(pos.tokenMint, list);
    }
    const tokens = Array.from(tokenMap.entries()).map(([mint, pos]) =>
      PnLCalculator.calculateTokenPnL(mint, pos[0]?.tokenSymbol || 'Unknown', pos, this.tokenPrices.get(mint) || 0)
    );

    // Calculate wallet summaries
    const walletMap = new Map<string, PositionPnL[]>();
    for (const pos of positions) {
      const list = walletMap.get(pos.walletAddress) || [];
      list.push(pos);
      walletMap.set(pos.walletAddress, list);
    }
    const wallets = Array.from(walletMap.entries()).map(([addr, pos]) =>
      PnLCalculator.calculateWalletPnL(addr, pos)
    );

    return {
      generatedAt: now,
      timeframe: { startTime, endTime, days: Math.floor((endTime - startTime) / 86400000) },
      totalTrades: trades.length,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalSolSpent,
      totalSolReceived,
      realizedPnLSol,
      realizedPnLPercent: totalSolSpent > 0 ? (realizedPnLSol / totalSolSpent) * 100 : 0,
      unrealizedPnLSol,
      unrealizedPnLPercent: totalSolSpent > 0 ? (unrealizedPnLSol / totalSolSpent) * 100 : 0,
      totalPnLSol: realizedPnLSol + unrealizedPnLSol,
      totalPnLPercent: totalSolSpent > 0 ? ((realizedPnLSol + unrealizedPnLSol) / totalSolSpent) * 100 : 0,
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: closed.length - wins.length - losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      avgHoldTimeMinutes: 0, // TODO: calculate properly
      tokens,
      wallets,
      positions,
    };
  }

  /** Get daily P&L breakdown */
  getDailyPnL(date: string): DailyPnL {
    // TODO: implement daily tracking with persistence
    return {
      date,
      trades: 0,
      solSpent: 0,
      solReceived: 0,
      realizedPnLSol: 0,
      realizedPnLPercent: 0,
      balanceChange: 0,
    };
  }

  /** Clear all data */
  clear(): void {
    this.trades.clear();
    this.positions.clear();
    this.tokenPrices.clear();
  }
}
