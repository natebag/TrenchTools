/**
 * P&L Calculator - Compute profit and loss
 */
import type {
  Trade, PositionPnL, TokenPnL, WalletPnL,
} from './types.js';

export class PnLCalculator {
  /** Calculate position P&L from trades */
  static calculatePositionPnL(
    tokenMint: string,
    trades: Trade[],
    currentPrice: number
  ): PositionPnL {
    const buys = trades.filter(t => t.side === 'buy' && t.status === 'completed');
    const sells = trades.filter(t => t.side === 'sell' && t.status === 'completed');

    const solSpent = buys.reduce((sum, t) => sum + t.solAmount, 0);
    const solReceived = sells.reduce((sum, t) => sum + t.solAmount, 0);
    const tokenAmount = buys.reduce((sum, t) => sum + t.tokenAmount, 0) -
                       sells.reduce((sum, t) => sum + t.tokenAmount, 0);

    const entryPrice = buys.length > 0
      ? solSpent / buys.reduce((sum, t) => sum + t.tokenAmount, 0)
      : 0;

    const realizedPnLSol = solReceived - (sells.length > 0 ?
      sells.reduce((sum, t) => sum + (t.tokenAmount * entryPrice), 0) : 0);
    const realizedPnLPercent = entryPrice > 0 ? (realizedPnLSol / (entryPrice * tokenAmount || 1)) * 100 : 0;

    const unrealizedPnLSol = tokenAmount * (currentPrice - entryPrice);
    const unrealizedPnLPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

    const totalPnLSol = realizedPnLSol + unrealizedPnLSol;
    const totalPnLPercent = solSpent > 0 ? (totalPnLSol / solSpent) * 100 : 0;

    return {
      id: `${tokenMint}-${trades[0]?.walletAddress || 'unknown'}`,
      tokenMint,
      tokenSymbol: trades[0]?.tokenSymbol,
      tokenName: trades[0]?.tokenName,
      walletAddress: trades[0]?.walletAddress || 'unknown',
      entryPrice,
      currentPrice,
      tokenAmount,
      solSpent,
      solReceived,
      openTime: trades[0]?.timestamp || Date.now(),
      closeTime: tokenAmount === 0 ? Date.now() : undefined,
      realizedPnLSol,
      realizedPnLPercent,
      unrealizedPnLSol,
      unrealizedPnLPercent,
      totalPnLSol,
      totalPnLPercent,
      trades,
      status: tokenAmount > 0 ? 'open' : 'closed',
    };
  }

  /** Calculate token P&L across all wallets */
  static calculateTokenPnL(
    tokenMint: string,
    symbol: string,
    positions: PositionPnL[],
    currentPrice: number
  ): TokenPnL {
    const allTrades = positions.flatMap(p => p.trades);
    const buys = allTrades.filter(t => t.side === 'buy');
    const sells = allTrades.filter(t => t.side === 'sell');

    const totalSolSpent = buys.reduce((sum, t) => sum + t.solAmount, 0);
    const totalSolReceived = sells.reduce((sum, t) => sum + t.solAmount, 0);
    const realizedPnLSol = totalSolReceived - (sells.length > 0 ?
      sells.reduce((sum, t) => sum + (t.tokenAmount * (totalSolSpent / (buys.reduce((s, b) => s + b.tokenAmount, 0) || 1))), 0) : 0);

    const openPositions = positions.filter(p => p.status === 'open');
    const unrealizedPnLSol = openPositions.reduce((sum, p) => sum + p.unrealizedPnLSol, 0);

    const totalPnLSol = realizedPnLSol + unrealizedPnLSol;
    const totalPnLPercent = totalSolSpent > 0 ? (totalPnLSol / totalSolSpent) * 100 : 0;

    const multipliers = positions.filter(p => p.status === 'closed').map(p => 1 + p.realizedPnLPercent / 100);

    return {
      tokenMint,
      tokenSymbol: symbol,
      tokenName: positions[0]?.tokenName,
      totalTrades: allTrades.length,
      totalBuys: buys.length,
      totalSells: sells.length,
      totalSolSpent,
      totalSolReceived,
      realizedPnLSol,
      realizedPnLPercent: totalSolSpent > 0 ? (realizedPnLSol / totalSolSpent) * 100 : 0,
      unrealizedPnLSol,
      unrealizedPnLPercent: totalSolSpent > 0 ? (unrealizedPnLSol / totalSolSpent) * 100 : 0,
      totalPnLSol,
      totalPnLPercent,
      avgBuyPrice: buys.length > 0 ? totalSolSpent / buys.reduce((s, t) => s + t.tokenAmount, 0) : 0,
      currentPrice,
      bestMultiplier: multipliers.length > 0 ? Math.max(...multipliers) : 1,
      worstMultiplier: multipliers.length > 0 ? Math.min(...multipliers) : 1,
      lastTradeTime: allTrades.length > 0 ? Math.max(...allTrades.map(t => t.timestamp)) : 0,
    };
  }

  /** Calculate wallet P&L */
  static calculateWalletPnL(address: string, positions: PositionPnL[]): WalletPnL {
    const closed = positions.filter(p => p.status === 'closed');
    const open = positions.filter(p => p.status === 'open');

    const realizedPnLSol = closed.reduce((sum, p) => sum + p.realizedPnLSol, 0);
    const unrealizedPnLSol = open.reduce((sum, p) => sum + p.unrealizedPnLSol, 0);
    const totalSolSpent = positions.reduce((sum, p) => sum + p.solSpent, 0);
    const totalSolReceived = positions.reduce((sum, p) => sum + p.solReceived, 0);

    const wins = closed.filter(p => p.realizedPnLSol > 0);
    const losses = closed.filter(p => p.realizedPnLSol < 0);

    return {
      walletAddress: address,
      totalTrades: positions.reduce((sum, p) => sum + p.trades.length, 0),
      totalTokens: new Set(positions.map(p => p.tokenMint)).size,
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
      avgWinPercent: wins.length > 0 ? wins.reduce((s, p) => s + p.realizedPnLPercent, 0) / wins.length : 0,
      avgLossPercent: losses.length > 0 ? losses.reduce((s, p) => s + p.realizedPnLPercent, 0) / losses.length : 0,
      largestWin: wins.length > 0 ? Math.max(...wins.map(p => p.realizedPnLSol)) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses.map(p => p.realizedPnLSol)) : 0,
    };
  }
}
