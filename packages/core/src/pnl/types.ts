/**
 * P&L Types - Profit and Loss tracking for TrenchSniper OS v0.2.0
 */

/** Trade side */
export type TradeSide = 'buy' | 'sell';

/** Trade status */
export type TradeStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/** Trade record */
export interface Trade {
  id: string;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  side: TradeSide;
  price: number;
  tokenAmount: number;
  solAmount: number;
  slippageBps: number;
  feeSol: number;
  signature: string;
  slot: number;
  timestamp: number;
  status: TradeStatus;
  walletAddress: string;
  fiatValue?: number;
  fiatCurrency?: string;
}

/** Position with P&L */
export interface PositionPnL {
  id: string;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  walletAddress: string;
  entryPrice: number;
  currentPrice: number;
  tokenAmount: number;
  solSpent: number;
  solReceived: number;
  openTime: number;
  closeTime?: number;
  realizedPnLSol: number;
  realizedPnLPercent: number;
  unrealizedPnLSol: number;
  unrealizedPnLPercent: number;
  totalPnLSol: number;
  totalPnLPercent: number;
  trades: Trade[];
  status: 'open' | 'closed';
}

/** Token P&L summary */
export interface TokenPnL {
  tokenMint: string;
  tokenSymbol: string;
  tokenName?: string;
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  totalSolSpent: number;
  totalSolReceived: number;
  realizedPnLSol: number;
  realizedPnLPercent: number;
  unrealizedPnLSol: number;
  unrealizedPnLPercent: number;
  totalPnLSol: number;
  totalPnLPercent: number;
  avgBuyPrice: number;
  currentPrice: number;
  bestMultiplier: number;
  worstMultiplier: number;
  lastTradeTime: number;
}

/** Wallet P&L summary */
export interface WalletPnL {
  walletAddress: string;
  totalTrades: number;
  totalTokens: number;
  totalSolSpent: number;
  totalSolReceived: number;
  realizedPnLSol: number;
  realizedPnLPercent: number;
  unrealizedPnLSol: number;
  unrealizedPnLPercent: number;
  totalPnLSol: number;
  totalPnLPercent: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  largestWin: number;
  largestLoss: number;
}

/** Portfolio P&L report */
export interface PnLReport {
  generatedAt: number;
  timeframe: {
    startTime: number;
    endTime: number;
    days: number;
  };
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  totalSolSpent: number;
  totalSolReceived: number;
  realizedPnLSol: number;
  realizedPnLPercent: number;
  unrealizedPnLSol: number;
  unrealizedPnLPercent: number;
  totalPnLSol: number;
  totalPnLPercent: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  avgHoldTimeMinutes: number;
  tokens: TokenPnL[];
  wallets: WalletPnL[];
  positions: PositionPnL[];
}

/** Daily P&L snapshot */
export interface DailyPnL {
  date: string;
  trades: number;
  solSpent: number;
  solReceived: number;
  realizedPnLSol: number;
  realizedPnLPercent: number;
  balanceChange: number;
}

/** P&L filter */
export interface PnLFilter {
  startTime?: number;
  endTime?: number;
  tokenMints?: string[];
  walletAddresses?: string[];
  minPnL?: number;
  maxPnL?: number;
  includeOpenPositions?: boolean;
}

/** P&L summary card */
export interface PnLSummaryCard {
  title: string;
  valueSol: number;
  valueUsd: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
  subtext: string;
  emoji: string;
}

/** Custom errors */
export class TradeNotFoundError extends Error {
  constructor(tradeId: string) {
    super(`Trade not found: ${tradeId}`);
    this.name = 'TradeNotFoundError';
  }
}

export class PositionNotFoundError extends Error {
  constructor(positionId: string) {
    super(`Position not found: ${positionId}`);
    this.name = 'PositionNotFoundError';
  }
}

export class InvalidPnLFilterError extends Error {
  constructor(message: string) {
    super(`Invalid PnL filter: ${message}`);
    this.name = 'InvalidPnLFilterError';
  }
}
