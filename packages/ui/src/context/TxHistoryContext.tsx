import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'trench_tx_history';
const MAX_STORED_TRADES = 100;

export interface TradeRecord {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  tokenMint: string;
  amount: number;        // SOL amount
  price?: number;        // Price in USD at time of trade
  wallet: string;
  txHash?: string;
  status: 'success' | 'failed' | 'pending';
  source?: 'sniper' | 'volume' | 'manual' | 'treasury';  // Which feature created this trade
}

interface TxHistoryContextType {
  trades: TradeRecord[];
  addTrade: (trade: Omit<TradeRecord, 'id'>) => void;
  getTradesForToken: (tokenMint: string) => TradeRecord[];
  clearTrades: () => void;
}

const TxHistoryContext = createContext<TxHistoryContextType | null>(null);

// Load trades from localStorage
function loadTrades(): TradeRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load trade history from localStorage:', e);
  }
  return [];
}

// Save trades to localStorage (limited to MAX_STORED_TRADES)
function saveTrades(trades: TradeRecord[]) {
  try {
    const toStore = trades.slice(0, MAX_STORED_TRADES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.error('Failed to save trade history to localStorage:', e);
  }
}

export function TxHistoryProvider({ children }: { children: ReactNode }) {
  const [trades, setTrades] = useState<TradeRecord[]>(() => loadTrades());

  // Persist trades to localStorage when they change
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  const addTrade = useCallback((trade: Omit<TradeRecord, 'id'>) => {
    const newTrade: TradeRecord = {
      ...trade,
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2)}`
    };
    setTrades(prev => [newTrade, ...prev].slice(0, 500)); // Keep last 500
  }, []);

  const getTradesForToken = useCallback((tokenMint: string) => {
    return trades.filter(t => t.tokenMint === tokenMint && t.status === 'success');
  }, [trades]);

  const clearTrades = useCallback(() => {
    setTrades([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <TxHistoryContext.Provider value={{ trades, addTrade, getTradesForToken, clearTrades }}>
      {children}
    </TxHistoryContext.Provider>
  );
}

export function useTxHistory() {
  const ctx = useContext(TxHistoryContext);
  if (!ctx) {
    throw new Error('useTxHistory must be used within TxHistoryProvider');
  }
  return ctx;
}
