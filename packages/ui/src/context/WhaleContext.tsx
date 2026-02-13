/**
 * WhaleContext - Whale watching and alerts system
 * 
 * Features:
 * - Watch wallet addresses for large transactions
 * - localStorage persistence
 * - Polling for new transactions
 * - Alert detection for whale activity
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// ============ Types ============

export interface WatchedWallet {
  id: string;
  address: string;
  label: string;
  addedAt: number;
  lastChecked: number;
}

export interface WhaleAlert {
  id: string;
  walletAddress: string;
  walletLabel?: string;
  type: 'large_buy' | 'large_sell' | 'accumulation' | 'draining' | 'large_transfer';
  timestamp: number;
  amount: number; // in SOL
  amountUsd?: number;
  tokenSymbol?: string;
  tokenAddress?: string;
  txSignature: string;
  description: string;
}

export interface Transaction {
  signature: string;
  blockTime: number;
  slot: number;
  fee: number;
  status: 'success' | 'fail';
  signer: string[];
  solTransfers?: Array<{
    source: string;
    destination: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    source: string;
    destination: string;
    amount: number;
    tokenAddress: string;
    symbol?: string;
  }>;
}

interface WhaleContextType {
  // State
  watchedWallets: WatchedWallet[];
  alerts: WhaleAlert[];
  isPolling: boolean;
  pollingInterval: number;
  lastPollTime: number | null;
  
  // Settings
  minSolAmount: number;
  minUsdAmount: number;
  
  // Actions
  addWallet: (address: string, label?: string) => void;
  removeWallet: (id: string) => void;
  updateWalletLabel: (id: string, label: string) => void;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
  setPollingInterval: (ms: number) => void;
  setMinSolAmount: (amount: number) => void;
  setMinUsdAmount: (amount: number) => void;
  startPolling: () => void;
  stopPolling: () => void;
  pollNow: () => Promise<void>;
}

// ============ Storage ============

const STORAGE_KEYS = {
  wallets: 'trench_whale_wallets_v1',
  alerts: 'trench_whale_alerts_v1',
  settings: 'trench_whale_settings_v1',
} as const;

const STORAGE_VERSION = 1;

interface StorageSchema<T> {
  version: number;
  data: T;
  updatedAt: number;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    const parsed: StorageSchema<T> = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION) return defaultValue;
    return parsed.data;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    const schema: StorageSchema<T> = {
      version: STORAGE_VERSION,
      data,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(schema));
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
}

// ============ API Functions ============

async function fetchWalletTransactions(address: string): Promise<Transaction[]> {
  try {
    // Using Solscan public API
    const response = await fetch(
      `https://api.solscan.io/account/transactions?address=${address}&limit=10`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      // Fallback to alternative API if Solscan fails
      return await fetchFromHelius(address);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Transform Solscan response to our format
    return data.data.map((tx: any) => ({
      signature: tx.txHash || tx.signature,
      blockTime: tx.blockTime,
      slot: tx.slot,
      fee: tx.fee || 0,
      status: tx.status === 'Success' ? 'success' : 'fail',
      signer: tx.signer || [],
      solTransfers: tx.solTransfers || [],
      tokenTransfers: tx.tokenTransfers || [],
    }));
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

async function fetchFromHelius(address: string): Promise<Transaction[]> {
  try {
    // Using public RPC with getSignaturesForAddress
    const response = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit: 10 }],
      }),
    });
    
    const data = await response.json();
    
    if (!data.result) return [];
    
    return data.result.map((sig: any) => ({
      signature: sig.signature,
      blockTime: sig.blockTime,
      slot: sig.slot,
      fee: 0,
      status: sig.err ? 'fail' : 'success',
      signer: [],
    }));
  } catch {
    return [];
  }
}

async function getSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana?.usd || 150; // Fallback price
  } catch {
    return 150;
  }
}

// ============ Alert Detection ============

function detectAlerts(
  transactions: Transaction[],
  wallet: WatchedWallet,
  minSolAmount: number,
  solPrice: number,
  existingAlerts: WhaleAlert[]
): WhaleAlert[] {
  const newAlerts: WhaleAlert[] = [];
  const existingSignatures = new Set(existingAlerts.map(a => a.txSignature));
  
  for (const tx of transactions) {
    // Skip already processed transactions
    if (existingSignatures.has(tx.signature)) continue;
    if (tx.status === 'fail') continue;
    
    // Check SOL transfers
    if (tx.solTransfers) {
      for (const transfer of tx.solTransfers) {
        const amountSol = transfer.amount / 1e9;
        
        if (amountSol >= minSolAmount) {
          const isReceiving = transfer.destination.toLowerCase() === wallet.address.toLowerCase();
          const isSending = transfer.source.toLowerCase() === wallet.address.toLowerCase();
          
          if (isReceiving || isSending) {
            newAlerts.push({
              id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              walletAddress: wallet.address,
              walletLabel: wallet.label,
              type: isReceiving ? 'large_buy' : 'large_sell',
              timestamp: tx.blockTime * 1000,
              amount: amountSol,
              amountUsd: amountSol * solPrice,
              txSignature: tx.signature,
              description: isReceiving 
                ? `Received ${amountSol.toFixed(2)} SOL ($${(amountSol * solPrice).toFixed(0)})`
                : `Sent ${amountSol.toFixed(2)} SOL ($${(amountSol * solPrice).toFixed(0)})`,
            });
          }
        }
      }
    }
    
    // Check token transfers for accumulation/draining patterns
    if (tx.tokenTransfers) {
      let totalTokensReceived = 0;
      let totalTokensSent = 0;
      
      for (const transfer of tx.tokenTransfers) {
        const isReceiving = transfer.destination.toLowerCase() === wallet.address.toLowerCase();
        const isSending = transfer.source.toLowerCase() === wallet.address.toLowerCase();
        
        if (isReceiving) totalTokensReceived += transfer.amount;
        if (isSending) totalTokensSent += transfer.amount;
      }
      
      // Detect draining (selling lots of tokens)
      if (totalTokensSent > 1000000 && totalTokensSent > totalTokensReceived * 10) {
        if (!existingSignatures.has(tx.signature)) {
          newAlerts.push({
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            walletAddress: wallet.address,
            walletLabel: wallet.label,
            type: 'draining',
            timestamp: tx.blockTime * 1000,
            amount: 0,
            txSignature: tx.signature,
            description: `⚠️ Wallet draining detected - large token outflow`,
          });
        }
      }
      
      // Detect accumulation (buying lots of tokens)
      if (totalTokensReceived > 1000000 && totalTokensReceived > totalTokensSent * 10) {
        if (!existingSignatures.has(tx.signature)) {
          newAlerts.push({
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            walletAddress: wallet.address,
            walletLabel: wallet.label,
            type: 'accumulation',
            timestamp: tx.blockTime * 1000,
            amount: 0,
            txSignature: tx.signature,
            description: `📈 Token accumulation detected - large token inflow`,
          });
        }
      }
    }
  }
  
  return newAlerts;
}

// ============ Context ============

const WhaleContext = createContext<WhaleContextType | undefined>(undefined);

// ============ Provider ============

interface WhaleSettings {
  pollingInterval: number;
  minSolAmount: number;
  minUsdAmount: number;
}

const defaultSettings: WhaleSettings = {
  pollingInterval: 60000, // 1 minute
  minSolAmount: 10,
  minUsdAmount: 1000,
};

export function WhaleProvider({ children }: { children: React.ReactNode }) {
  const [watchedWallets, setWatchedWallets] = useState<WatchedWallet[]>(() =>
    loadFromStorage(STORAGE_KEYS.wallets, [])
  );
  
  const [alerts, setAlerts] = useState<WhaleAlert[]>(() =>
    loadFromStorage(STORAGE_KEYS.alerts, [])
  );
  
  const [settings, setSettings] = useState<WhaleSettings>(() =>
    loadFromStorage(STORAGE_KEYS.settings, defaultSettings)
  );
  
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<number | null>(null);
  
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Debounced save
  const debouncedSave = useCallback(<T,>(key: string, data: T) => {
    const existing = saveTimerRef.current.get(key);
    if (existing) clearTimeout(existing);
    
    const timer = setTimeout(() => {
      saveToStorage(key, data);
      saveTimerRef.current.delete(key);
    }, 500);
    
    saveTimerRef.current.set(key, timer);
  }, []);

  // Auto-save on state changes
  useEffect(() => {
    debouncedSave(STORAGE_KEYS.wallets, watchedWallets);
  }, [watchedWallets, debouncedSave]);

  useEffect(() => {
    debouncedSave(STORAGE_KEYS.alerts, alerts);
  }, [alerts, debouncedSave]);

  useEffect(() => {
    debouncedSave(STORAGE_KEYS.settings, settings);
  }, [settings, debouncedSave]);

  // Poll function
  const pollNow = useCallback(async () => {
    if (watchedWallets.length === 0) return;
    
    const solPrice = await getSolPrice();
    let newAlerts: WhaleAlert[] = [];
    
    for (const wallet of watchedWallets) {
      try {
        const transactions = await fetchWalletTransactions(wallet.address);
        const walletAlerts = detectAlerts(
          transactions,
          wallet,
          settings.minSolAmount,
          solPrice,
          alerts
        );
        newAlerts = [...newAlerts, ...walletAlerts];
        
        // Update last checked time
        setWatchedWallets(prev => 
          prev.map(w => w.id === wallet.id 
            ? { ...w, lastChecked: Date.now() } 
            : w
          )
        );
      } catch (error) {
        console.error(`Error polling wallet ${wallet.address}:`, error);
      }
    }
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 100)); // Keep last 100 alerts
    }
    
    setLastPollTime(Date.now());
  }, [watchedWallets, alerts, settings.minSolAmount]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    
    setIsPolling(true);
    pollNow(); // Poll immediately
    
    pollingRef.current = setInterval(() => {
      pollNow();
    }, settings.pollingInterval);
  }, [pollNow, settings.pollingInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Auto-start polling when wallets exist
  useEffect(() => {
    if (watchedWallets.length > 0 && !isPolling) {
      startPolling();
    } else if (watchedWallets.length === 0 && isPolling) {
      stopPolling();
    }
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [watchedWallets.length]);

  // Update polling interval when changed
  useEffect(() => {
    if (isPolling) {
      stopPolling();
      startPolling();
    }
  }, [settings.pollingInterval]);

  // Actions
  const addWallet = useCallback((address: string, label?: string) => {
    // Validate Solana address (basic check)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      console.error('Invalid Solana address');
      return;
    }
    
    // Check for duplicates
    if (watchedWallets.some(w => w.address.toLowerCase() === address.toLowerCase())) {
      console.warn('Wallet already being watched');
      return;
    }
    
    const newWallet: WatchedWallet = {
      id: `whale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      label: label || `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
      addedAt: Date.now(),
      lastChecked: 0,
    };
    
    setWatchedWallets(prev => [...prev, newWallet]);
  }, [watchedWallets]);

  const removeWallet = useCallback((id: string) => {
    setWatchedWallets(prev => prev.filter(w => w.id !== id));
  }, []);

  const updateWalletLabel = useCallback((id: string, label: string) => {
    setWatchedWallets(prev => 
      prev.map(w => w.id === id ? { ...w, label } : w)
    );
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const setPollingInterval = useCallback((ms: number) => {
    setSettings(prev => ({ ...prev, pollingInterval: Math.max(30000, ms) })); // Min 30s
  }, []);

  const setMinSolAmount = useCallback((amount: number) => {
    setSettings(prev => ({ ...prev, minSolAmount: Math.max(0, amount) }));
  }, []);

  const setMinUsdAmount = useCallback((amount: number) => {
    setSettings(prev => ({ ...prev, minUsdAmount: Math.max(0, amount) }));
  }, []);

  const value: WhaleContextType = {
    watchedWallets,
    alerts,
    isPolling,
    pollingInterval: settings.pollingInterval,
    lastPollTime,
    minSolAmount: settings.minSolAmount,
    minUsdAmount: settings.minUsdAmount,
    addWallet,
    removeWallet,
    updateWalletLabel,
    clearAlerts,
    dismissAlert,
    setPollingInterval,
    setMinSolAmount,
    setMinUsdAmount,
    startPolling,
    stopPolling,
    pollNow,
  };

  return (
    <WhaleContext.Provider value={value}>
      {children}
    </WhaleContext.Provider>
  );
}

// ============ Hook ============

export function useWhale() {
  const context = useContext(WhaleContext);
  if (context === undefined) {
    throw new Error('useWhale must be used within a WhaleProvider');
  }
  return context;
}
