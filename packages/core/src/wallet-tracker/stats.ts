/**
 * Trader stats — FIFO trade matching, win rate, PnL calculation.
 */

import type { WalletTrade, WalletHolding, TraderStats } from './types.js';

interface OpenPosition {
  tokenAmount: number;
  costSol: number;
  timestamp: number;
}

export function calculateStats(trades: WalletTrade[]): TraderStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      buyCount: 0,
      sellCount: 0,
      uniqueTokens: 0,
      winRate: 0,
      totalPnlSol: 0,
      avgHoldTimeMs: 0,
      bestTradePnlSol: 0,
      worstTradePnlSol: 0,
    };
  }

  const buys = trades.filter(t => t.type === 'buy');
  const sells = trades.filter(t => t.type === 'sell');
  const uniqueTokens = new Set(trades.map(t => t.tokenMint)).size;

  // FIFO matching per token
  const openByToken = new Map<string, OpenPosition[]>();
  let totalPnl = 0;
  let wins = 0;
  let closedTrades = 0;
  let totalHoldTimeMs = 0;
  let bestPnl = 0;
  let worstPnl = 0;

  // Process trades chronologically
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  for (const trade of sorted) {
    if (trade.type === 'buy') {
      const queue = openByToken.get(trade.tokenMint) || [];
      queue.push({
        tokenAmount: trade.tokenAmount,
        costSol: trade.solAmount,
        timestamp: trade.timestamp,
      });
      openByToken.set(trade.tokenMint, queue);
    } else {
      // Sell — match against open buys FIFO
      const queue = openByToken.get(trade.tokenMint);
      if (!queue || queue.length === 0) continue;

      let remainingToSell = trade.tokenAmount;
      let totalCostBasis = 0;

      while (remainingToSell > 0 && queue.length > 0) {
        const oldest = queue[0];
        const matched = Math.min(remainingToSell, oldest.tokenAmount);
        const costBasisPortion = (matched / oldest.tokenAmount) * oldest.costSol;

        totalCostBasis += costBasisPortion;
        totalHoldTimeMs += trade.timestamp - oldest.timestamp;

        oldest.tokenAmount -= matched;
        oldest.costSol -= costBasisPortion;
        remainingToSell -= matched;

        if (oldest.tokenAmount <= 0.000001) {
          queue.shift();
        }
      }

      const pnl = trade.solAmount - totalCostBasis;
      totalPnl += pnl;
      closedTrades++;

      if (pnl > 0) wins++;
      if (pnl > bestPnl) bestPnl = pnl;
      if (pnl < worstPnl) worstPnl = pnl;
    }
  }

  return {
    totalTrades: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    uniqueTokens,
    winRate: closedTrades > 0 ? (wins / closedTrades) * 100 : 0,
    totalPnlSol: totalPnl,
    avgHoldTimeMs: closedTrades > 0 ? totalHoldTimeMs / closedTrades : 0,
    bestTradePnlSol: bestPnl,
    worstTradePnlSol: worstPnl,
  };
}

export function getTopTokens(holdings: WalletHolding[], limit: number = 5): WalletHolding[] {
  return [...holdings]
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
    .slice(0, limit);
}

export function formatStatsReport(stats: TraderStats): string {
  const holdTime = stats.avgHoldTimeMs > 0
    ? formatDuration(stats.avgHoldTimeMs)
    : 'N/A';

  return [
    `Trader Statistics:`,
    ``,
    `Total Trades: ${stats.totalTrades} (${stats.buyCount} buys, ${stats.sellCount} sells)`,
    `Unique Tokens: ${stats.uniqueTokens}`,
    `Win Rate: ${stats.winRate.toFixed(1)}%`,
    `Total PnL: ${stats.totalPnlSol >= 0 ? '+' : ''}${stats.totalPnlSol.toFixed(4)} SOL`,
    `Avg Hold Time: ${holdTime}`,
    `Best Trade: +${stats.bestTradePnlSol.toFixed(4)} SOL`,
    `Worst Trade: ${stats.worstTradePnlSol.toFixed(4)} SOL`,
  ].join('\n');
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
