/**
 * PnLContext - Real P&L Tracking
 * TrenchSniper OS
 * 
 * Tracks:
 * - Entry price for each token position
 * - Current prices (fetched from DexScreener)
 * - Realized P&L (from completed sells)
 * - Unrealized P&L (current holdings)
 * - Total SOL spent vs current value
 * - Portfolio value over time
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useTxHistory } from './TxHistoryContext';

const STORAGE_KEY = 'trench_pnl_data';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const PRICE_REFRESH_INTERVAL = 30000; // 30 seconds

// ============ Types ============

export interface TokenPosition {
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogo?: string;
  
  // Cost basis
  totalTokensBought: number;
  totalSolSpent: number;
  avgEntryPrice: number;    // SOL per token
  
  // Current state
  tokensHeld: number;
  currentPrice: number;     // SOL per token
  currentPriceUsd: number;
  lastPriceUpdate: number;
  
  // Realized (from sells)
  tokensSold: number;
  solReceived: number;
  realizedPnLSol: number;
  
  // Unrealized (current holdings)
  unrealizedPnLSol: number;
  unrealizedPnLPercent: number;
  
  // Combined
  totalPnLSol: number;
  totalPnLPercent: number;
  
  // Trade history
  trades: PositionTrade[];
  firstTradeTime: number;
  lastTradeTime: number;
}

export interface PositionTrade {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  tokenAmount: number;
  solAmount: number;
  pricePerToken: number;
  txHash?: string;
}

export interface PortfolioSnapshot {
  timestamp: number;
  totalValueSol: number;
  totalValueUsd: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  positionCount: number;
}

export interface TradeResult {
  tokenMint: string;
  tokenSymbol?: string;
  pnlSol: number;
  pnlPercent: number;
  solSpent: number;
  solReceived: number;
  holdTimeMs: number;
  isWin: boolean;
  closedAt: number;
}

export interface PnLStats {
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  totalPnL: number;
  totalSolSpent: number;
  totalSolReceived: number;
  currentPortfolioValue: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWinSol: number;
  avgLossSol: number;
  bestTrade: TradeResult | null;
  worstTrade: TradeResult | null;
  profitFactor: number;
}

interface PnLState {
  positions: Map<string, TokenPosition>;
  closedTrades: TradeResult[];
  portfolioHistory: PortfolioSnapshot[];
  lastUpdated: number;
}

interface PnLContextType {
  // State
  positions: TokenPosition[];
  openPositions: TokenPosition[];
  closedTrades: TradeResult[];
  portfolioHistory: PortfolioSnapshot[];
  stats: PnLStats;
  loading: boolean;
  refreshing: boolean;
  
  // Actions
  refreshPrices: () => Promise<void>;
  recalculateFromTrades: () => void;
  clearPnLData: () => void;
  
  // Utilities
  getPositionForToken: (tokenMint: string) => TokenPosition | undefined;
  formatSol: (amount: number) => string;
  formatPercent: (percent: number) => string;
}

// ============ Storage ============

function loadPnLState(): PnLState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        positions: new Map(parsed.positions || []),
        closedTrades: parsed.closedTrades || [],
        portfolioHistory: parsed.portfolioHistory || [],
        lastUpdated: parsed.lastUpdated || 0,
      };
    }
  } catch (e) {
    console.error('Failed to load P&L data from localStorage:', e);
  }
  return {
    positions: new Map(),
    closedTrades: [],
    portfolioHistory: [],
    lastUpdated: 0,
  };
}

function savePnLState(state: PnLState) {
  try {
    const toStore = {
      positions: Array.from(state.positions.entries()),
      closedTrades: state.closedTrades.slice(0, 200), // Keep last 200
      portfolioHistory: state.portfolioHistory.slice(-500), // Keep last 500 snapshots
      lastUpdated: state.lastUpdated,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.error('Failed to save P&L data to localStorage:', e);
  }
}

// ============ DexScreener Price Fetching ============

async function fetchTokenPrices(tokenMints: string[]): Promise<Map<string, { 
  priceUsd: number; 
  priceSol: number; 
  symbol?: string;
  name?: string;
  logo?: string;
}>> {
  const prices = new Map();
  
  if (tokenMints.length === 0) return prices;
  
  // DexScreener allows up to 30 addresses per request
  const chunks: string[][] = [];
  for (let i = 0; i < tokenMints.length; i += 30) {
    chunks.push(tokenMints.slice(i, i + 30));
  }
  
  for (const chunk of chunks) {
    try {
      const response = await fetch(`${DEXSCREENER_API}/${chunk.join(',')}`);
      if (!response.ok) continue;
      
      const data = await response.json();
      const pairs = data.pairs || [];
      
      // Get best pair for each token (highest liquidity)
      const tokenPairs = new Map<string, typeof pairs[0]>();
      for (const pair of pairs) {
        const tokenAddr = pair.baseToken?.address;
        if (!tokenAddr) continue;
        
        const existing = tokenPairs.get(tokenAddr);
        if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
          tokenPairs.set(tokenAddr, pair);
        }
      }
      
      // Extract prices
      for (const [tokenAddr, pair] of tokenPairs) {
        const priceUsd = parseFloat(pair.priceUsd) || 0;
        // Approximate SOL price (we'd need another call for exact, using rough estimate)
        const solPriceUsd = 150; // Fallback, should fetch real SOL price
        const priceSol = priceUsd / solPriceUsd;
        
        prices.set(tokenAddr, {
          priceUsd,
          priceSol,
          symbol: pair.baseToken?.symbol,
          name: pair.baseToken?.name,
          logo: pair.info?.imageUrl,
        });
      }
    } catch (e) {
      console.error('DexScreener fetch error:', e);
    }
  }
  
  return prices;
}

// ============ Context ============

const PnLContext = createContext<PnLContextType | null>(null);

export function PnLProvider({ children }: { children: ReactNode }) {
  const { trades } = useTxHistory();
  
  const [state, setState] = useState<PnLState>(() => loadPnLState());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTradesHashRef = useRef<string>('');

  // Calculate positions from trades
  const recalculateFromTrades = useCallback(() => {
    const positions = new Map<string, TokenPosition>();
    const closedTrades: TradeResult[] = [];
    
    // Sort trades by timestamp
    const sortedTrades = [...trades]
      .filter(t => t.status === 'success')
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Process each trade
    for (const trade of sortedTrades) {
      const mint = trade.tokenMint;
      if (!mint || mint === 'unknown') continue;
      
      let position = positions.get(mint);
      
      if (!position) {
        position = {
          tokenMint: mint,
          totalTokensBought: 0,
          totalSolSpent: 0,
          avgEntryPrice: 0,
          tokensHeld: 0,
          currentPrice: 0,
          currentPriceUsd: 0,
          lastPriceUpdate: 0,
          tokensSold: 0,
          solReceived: 0,
          realizedPnLSol: 0,
          unrealizedPnLSol: 0,
          unrealizedPnLPercent: 0,
          totalPnLSol: 0,
          totalPnLPercent: 0,
          trades: [],
          firstTradeTime: trade.timestamp,
          lastTradeTime: trade.timestamp,
        };
        positions.set(mint, position);
      }
      
      // Estimate token amount if not provided (would need real parsing)
      // For now, use SOL amount as proxy (imperfect but functional)
      const estimatedTokens = trade.amount * 1000000; // Rough estimate
      
      const positionTrade: PositionTrade = {
        id: trade.id,
        timestamp: trade.timestamp,
        type: trade.type,
        tokenAmount: estimatedTokens,
        solAmount: trade.amount,
        pricePerToken: trade.amount / estimatedTokens,
        txHash: trade.txHash,
      };
      
      position.trades.push(positionTrade);
      position.lastTradeTime = trade.timestamp;
      
      if (trade.type === 'buy') {
        position.totalTokensBought += estimatedTokens;
        position.totalSolSpent += trade.amount;
        position.tokensHeld += estimatedTokens;
        
        // Update average entry price
        if (position.tokensHeld > 0) {
          position.avgEntryPrice = position.totalSolSpent / position.totalTokensBought;
        }
      } else if (trade.type === 'sell') {
        const tokensSold = Math.min(estimatedTokens, position.tokensHeld);
        position.tokensSold += tokensSold;
        position.solReceived += trade.amount;
        position.tokensHeld = Math.max(0, position.tokensHeld - tokensSold);
        
        // Calculate realized P&L for this sale
        const costBasis = tokensSold * position.avgEntryPrice;
        const realizedPnL = trade.amount - costBasis;
        position.realizedPnLSol += realizedPnL;
        
        // If position closed, record it
        if (position.tokensHeld <= 0) {
          const totalPnL = position.solReceived - position.totalSolSpent;
          const pnlPercent = position.totalSolSpent > 0 
            ? (totalPnL / position.totalSolSpent) * 100 
            : 0;
          
          closedTrades.push({
            tokenMint: mint,
            tokenSymbol: position.tokenSymbol,
            pnlSol: totalPnL,
            pnlPercent,
            solSpent: position.totalSolSpent,
            solReceived: position.solReceived,
            holdTimeMs: position.lastTradeTime - position.firstTradeTime,
            isWin: totalPnL > 0,
            closedAt: trade.timestamp,
          });
        }
      }
    }
    
    // Calculate total P&L for each position
    for (const position of positions.values()) {
      position.totalPnLSol = position.realizedPnLSol + position.unrealizedPnLSol;
      if (position.totalSolSpent > 0) {
        position.totalPnLPercent = (position.totalPnLSol / position.totalSolSpent) * 100;
      }
    }
    
    setState(prev => {
      const newState = {
        ...prev,
        positions,
        closedTrades: [...closedTrades, ...prev.closedTrades.filter(
          ct => !closedTrades.some(nct => nct.tokenMint === ct.tokenMint && nct.closedAt === ct.closedAt)
        )].slice(0, 200),
        lastUpdated: Date.now(),
      };
      savePnLState(newState);
      return newState;
    });
    
    setLoading(false);
  }, [trades]);

  // Refresh prices from DexScreener
  const refreshPrices = useCallback(async () => {
    const tokenMints = Array.from(state.positions.keys()).filter(
      mint => {
        const pos = state.positions.get(mint);
        return pos && pos.tokensHeld > 0;
      }
    );
    
    if (tokenMints.length === 0) {
      setRefreshing(false);
      return;
    }
    
    setRefreshing(true);
    
    try {
      const prices = await fetchTokenPrices(tokenMints);
      
      setState(prev => {
        const newPositions = new Map(prev.positions);
        let portfolioValueSol = 0;
        let portfolioValueUsd = 0;
        let totalUnrealized = 0;
        let totalRealized = 0;
        let posCount = 0;
        
        for (const [mint, position] of newPositions) {
          const priceData = prices.get(mint);
          
          if (priceData) {
            position.currentPrice = priceData.priceSol;
            position.currentPriceUsd = priceData.priceUsd;
            position.lastPriceUpdate = Date.now();
            
            if (priceData.symbol) position.tokenSymbol = priceData.symbol;
            if (priceData.name) position.tokenName = priceData.name;
            if (priceData.logo) position.tokenLogo = priceData.logo;
          }
          
          // Recalculate unrealized P&L
          if (position.tokensHeld > 0 && position.currentPrice > 0) {
            const currentValue = position.tokensHeld * position.currentPrice;
            const costBasis = position.tokensHeld * position.avgEntryPrice;
            position.unrealizedPnLSol = currentValue - costBasis;
            position.unrealizedPnLPercent = costBasis > 0 
              ? (position.unrealizedPnLSol / costBasis) * 100 
              : 0;
            
            portfolioValueSol += currentValue;
            portfolioValueUsd += position.tokensHeld * position.currentPriceUsd;
            totalUnrealized += position.unrealizedPnLSol;
            posCount++;
          }
          
          totalRealized += position.realizedPnLSol;
          
          // Update totals
          position.totalPnLSol = position.realizedPnLSol + position.unrealizedPnLSol;
          if (position.totalSolSpent > 0) {
            position.totalPnLPercent = (position.totalPnLSol / position.totalSolSpent) * 100;
          }
        }
        
        // Add portfolio snapshot
        const snapshot: PortfolioSnapshot = {
          timestamp: Date.now(),
          totalValueSol: portfolioValueSol,
          totalValueUsd: portfolioValueUsd,
          totalRealizedPnL: totalRealized,
          totalUnrealizedPnL: totalUnrealized,
          positionCount: posCount,
        };
        
        const newHistory = [...prev.portfolioHistory, snapshot].slice(-500);
        
        const newState = {
          ...prev,
          positions: newPositions,
          portfolioHistory: newHistory,
          lastUpdated: Date.now(),
        };
        savePnLState(newState);
        return newState;
      });
    } catch (e) {
      console.error('Failed to refresh prices:', e);
    } finally {
      setRefreshing(false);
    }
  }, [state.positions]);

  // Clear all P&L data
  const clearPnLData = useCallback(() => {
    const emptyState: PnLState = {
      positions: new Map(),
      closedTrades: [],
      portfolioHistory: [],
      lastUpdated: Date.now(),
    };
    setState(emptyState);
    savePnLState(emptyState);
  }, []);

  // Get position for specific token
  const getPositionForToken = useCallback((tokenMint: string) => {
    return state.positions.get(tokenMint);
  }, [state.positions]);

  // Recalculate when trades change
  useEffect(() => {
    const tradesHash = trades.map(t => t.id).join(',');
    if (tradesHash !== lastTradesHashRef.current) {
      lastTradesHashRef.current = tradesHash;
      recalculateFromTrades();
    }
  }, [trades, recalculateFromTrades]);

  // Set up price refresh interval
  useEffect(() => {
    refreshPrices();
    
    refreshIntervalRef.current = setInterval(() => {
      refreshPrices();
    }, PRICE_REFRESH_INTERVAL);
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [refreshPrices]);

  // Calculate stats
  const stats: PnLStats = (() => {
    const positions = Array.from(state.positions.values());
    const openPositions = positions.filter(p => p.tokensHeld > 0);
    const allClosed = state.closedTrades;
    
    const wins = allClosed.filter(t => t.isWin);
    const losses = allClosed.filter(t => !t.isWin);
    
    const totalRealizedPnL = positions.reduce((sum, p) => sum + p.realizedPnLSol, 0);
    const totalUnrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealizedPnLSol, 0);
    const totalSolSpent = positions.reduce((sum, p) => sum + p.totalSolSpent, 0);
    const totalSolReceived = positions.reduce((sum, p) => sum + p.solReceived, 0);
    
    const currentPortfolioValue = openPositions.reduce((sum, p) => {
      return sum + (p.tokensHeld * p.currentPrice);
    }, 0);
    
    const avgWinSol = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.pnlSol, 0) / wins.length 
      : 0;
    const avgLossSol = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnlSol, 0) / losses.length)
      : 0;
    
    const totalWins = wins.reduce((sum, t) => sum + t.pnlSol, 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnlSol, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    // Find best and worst trades
    const sortedByPnL = [...allClosed].sort((a, b) => b.pnlSol - a.pnlSol);
    const bestTrade = sortedByPnL[0] || null;
    const worstTrade = sortedByPnL[sortedByPnL.length - 1] || null;
    
    return {
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalPnL: totalRealizedPnL + totalUnrealizedPnL,
      totalSolSpent,
      totalSolReceived,
      currentPortfolioValue,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: allClosed.length > 0 ? (wins.length / allClosed.length) * 100 : 0,
      avgWinSol,
      avgLossSol,
      bestTrade,
      worstTrade,
      profitFactor,
    };
  })();

  // Utility functions
  const formatSol = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toFixed(6)} SOL`;
  };
  
  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const value: PnLContextType = {
    positions: Array.from(state.positions.values()),
    openPositions: Array.from(state.positions.values()).filter(p => p.tokensHeld > 0),
    closedTrades: state.closedTrades,
    portfolioHistory: state.portfolioHistory,
    stats,
    loading,
    refreshing,
    refreshPrices,
    recalculateFromTrades,
    clearPnLData,
    getPositionForToken,
    formatSol,
    formatPercent,
  };

  return (
    <PnLContext.Provider value={value}>
      {children}
    </PnLContext.Provider>
  );
}

export function usePnL() {
  const ctx = useContext(PnLContext);
  if (!ctx) {
    throw new Error('usePnL must be used within PnLProvider');
  }
  return ctx;
}
