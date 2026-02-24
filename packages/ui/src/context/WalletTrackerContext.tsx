/**
 * WalletTrackerContext — track wallets, view holdings/trades/stats.
 *
 * Self-hosted: imports fetchHoldings/fetchTrades/calculateStats from core.
 * Hosted: fetches from /api/wallet-tracker/* endpoints.
 *
 * Replaces the old WhaleContext with richer wallet monitoring.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { useNetwork } from '@/context/NetworkContext';
import type {
  TrackedWallet,
  WalletHolding,
  WalletTrade,
  TraderStats,
  WalletTradeAlert,
} from '@trenchtools/core';

// ============ Types ============

export interface TrackerSettings {
  pollingIntervalMs: number;
  alertOnBuy: boolean;
  alertOnSell: boolean;
  soundEnabled: boolean;
  maxAlerts: number;
}

interface WalletTrackerContextType {
  trackedWallets: TrackedWallet[];
  selectedWalletId: string | null;
  holdings: WalletHolding[];
  trades: WalletTrade[];
  stats: TraderStats | null;
  alerts: WalletTradeAlert[];
  isPolling: boolean;
  isLoading: boolean;
  settings: TrackerSettings;

  addWallet: (address: string, label?: string) => void;
  removeWallet: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  selectWallet: (id: string | null) => void;
  refreshWallet: (id: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  updateSettings: (partial: Partial<TrackerSettings>) => void;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
}

// ============ Defaults ============

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';

const DEFAULT_SETTINGS: TrackerSettings = {
  pollingIntervalMs: 30000,
  alertOnBuy: true,
  alertOnSell: true,
  soundEnabled: false,
  maxAlerts: 200,
};

// ============ Storage ============

const STORAGE_KEYS = {
  wallets: 'trench_wallet_tracker_wallets_v1',
  alerts: 'trench_wallet_tracker_alerts_v1',
  settings: 'trench_wallet_tracker_settings_v1',
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
    const schema: StorageSchema<T> = { version: STORAGE_VERSION, data, updatedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(schema));
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
}

// ============ Migration from WhaleContext ============

function migrateFromWhaleContext(): TrackedWallet[] {
  try {
    const raw = localStorage.getItem('trench_whale_wallets_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const data = parsed.version === 1 ? parsed.data : null;
    if (!Array.isArray(data)) return [];

    const migrated: TrackedWallet[] = data.map((w: any) => ({
      id: w.id || `wt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address: w.address,
      label: w.label || `Wallet ${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
      chain: 'solana' as const,
      addedAt: w.addedAt || Date.now(),
      lastChecked: w.lastChecked,
    }));

    // Clean up old keys
    localStorage.removeItem('trench_whale_wallets_v1');
    localStorage.removeItem('trench_whale_alerts_v1');
    localStorage.removeItem('trench_whale_settings_v1');

    return migrated;
  } catch {
    return [];
  }
}

// ============ Context ============

const WalletTrackerContext = createContext<WalletTrackerContextType | null>(null);

export function useWalletTracker(): WalletTrackerContextType {
  const ctx = useContext(WalletTrackerContext);
  if (!ctx) throw new Error('useWalletTracker must be used within WalletTrackerProvider');
  return ctx;
}

export function WalletTrackerProvider({ children }: { children: React.ReactNode }) {
  const { rpcUrl } = useNetwork();

  const [trackedWallets, setTrackedWallets] = useState<TrackedWallet[]>(() => {
    const stored = loadFromStorage<TrackedWallet[]>(STORAGE_KEYS.wallets, []);
    if (stored.length > 0) return stored;
    // Try migrating from old WhaleContext
    const migrated = migrateFromWhaleContext();
    if (migrated.length > 0) {
      saveToStorage(STORAGE_KEYS.wallets, migrated);
    }
    return migrated;
  });

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<WalletHolding[]>([]);
  const [trades, setTrades] = useState<WalletTrade[]>([]);
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [alerts, setAlerts] = useState<WalletTradeAlert[]>(() =>
    loadFromStorage<WalletTradeAlert[]>(STORAGE_KEYS.alerts, []),
  );
  const [settings, setSettings] = useState<TrackerSettings>(() =>
    loadFromStorage<TrackerSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  );
  const [isPolling, setIsPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownSignatures = useRef(new Set<string>());
  const settingsRef = useRef(settings);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Debounced save
  const scheduleSave = useCallback((key: string, data: unknown) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToStorage(key, data), 500);
  }, []);

  // Auto-save
  useEffect(() => { scheduleSave(STORAGE_KEYS.wallets, trackedWallets); }, [trackedWallets, scheduleSave]);
  useEffect(() => { scheduleSave(STORAGE_KEYS.alerts, alerts); }, [alerts, scheduleSave]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.settings, settings); }, [settings]);

  // ============ Data Fetching ============

  const fetchWalletData = useCallback(async (address: string) => {
    if (IS_HOSTED) {
      const [holdingsResp, tradesResp, statsResp] = await Promise.all([
        fetch(`/api/wallet-tracker/holdings?address=${address}`),
        fetch(`/api/wallet-tracker/trades?address=${address}&limit=50`),
        fetch(`/api/wallet-tracker/stats?address=${address}`),
      ]);
      return {
        holdings: holdingsResp.ok ? await holdingsResp.json() : [],
        trades: tradesResp.ok ? await tradesResp.json() : [],
        stats: statsResp.ok ? await statsResp.json() : null,
      };
    } else {
      const { fetchHoldings, fetchTrades, calculateStats } = await import('@trenchtools/core');
      const connection = new Connection(rpcUrl, 'confirmed');
      const heliusKey = localStorage.getItem('trench_helius_key') || undefined;
      const [h, t] = await Promise.all([
        fetchHoldings(connection, address, heliusKey),
        fetchTrades(address, heliusKey, 50),
      ]);
      const s = calculateStats(t);
      return { holdings: h, trades: t, stats: s };
    }
  }, [rpcUrl]);

  // ============ Refresh Selected Wallet ============

  const refreshWallet = useCallback(async (id: string) => {
    const wallet = trackedWallets.find(w => w.id === id);
    if (!wallet) return;

    setIsLoading(true);
    try {
      const data = await fetchWalletData(wallet.address);
      setHoldings(data.holdings);
      setTrades(data.trades);
      setStats(data.stats);

      // Update lastChecked
      setTrackedWallets(prev =>
        prev.map(w => w.id === id ? { ...w, lastChecked: Date.now() } : w),
      );
    } catch (err) {
      console.error(`Failed to refresh wallet ${wallet.address}:`, err);
    } finally {
      setIsLoading(false);
    }
  }, [trackedWallets, fetchWalletData]);

  // Auto-refresh when selected wallet changes
  useEffect(() => {
    if (selectedWalletId) {
      refreshWallet(selectedWalletId);
    } else {
      setHoldings([]);
      setTrades([]);
      setStats(null);
    }
  }, [selectedWalletId]);

  // ============ Polling for Trade Alerts ============

  const pollForAlerts = useCallback(async () => {
    for (const wallet of trackedWallets) {
      try {
        let newTrades: WalletTrade[];

        if (IS_HOSTED) {
          const resp = await fetch(`/api/wallet-tracker/trades?address=${wallet.address}&limit=10`);
          newTrades = resp.ok ? await resp.json() : [];
        } else {
          const { fetchTrades } = await import('@trenchtools/core');
          const heliusKey = localStorage.getItem('trench_helius_key') || undefined;
          newTrades = await fetchTrades(wallet.address, heliusKey, 10);
        }

        for (const trade of newTrades) {
          if (knownSignatures.current.has(trade.signature)) continue;
          knownSignatures.current.add(trade.signature);

          // Limit known signatures buffer
          if (knownSignatures.current.size > 5000) {
            const arr = Array.from(knownSignatures.current);
            knownSignatures.current = new Set(arr.slice(-2500));
          }

          const s = settingsRef.current;
          if (trade.type === 'buy' && !s.alertOnBuy) continue;
          if (trade.type === 'sell' && !s.alertOnSell) continue;

          const alert: WalletTradeAlert = {
            id: `wta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            walletAddress: wallet.address,
            walletLabel: wallet.label,
            trade,
            timestamp: Date.now(),
          };

          setAlerts(prev => {
            const next = [alert, ...prev];
            return next.length > s.maxAlerts ? next.slice(0, s.maxAlerts) : next;
          });
        }
      } catch (err) {
        console.error(`Poll error for ${wallet.address}:`, err);
      }
    }
  }, [trackedWallets]);

  // ============ Polling Lifecycle ============

  const startPolling = useCallback(() => {
    if (pollingRef.current || trackedWallets.length === 0) return;
    setIsPolling(true);
    pollForAlerts();
    pollingRef.current = setInterval(pollForAlerts, settings.pollingIntervalMs);
  }, [pollForAlerts, settings.pollingIntervalMs, trackedWallets.length]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Auto-start polling when wallets exist
  useEffect(() => {
    if (trackedWallets.length > 0 && !pollingRef.current) {
      startPolling();
    } else if (trackedWallets.length === 0) {
      stopPolling();
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [trackedWallets.length]);

  // Restart polling when interval changes
  useEffect(() => {
    if (isPolling) {
      stopPolling();
      startPolling();
    }
  }, [settings.pollingIntervalMs]);

  // ============ Actions ============

  const addWallet = useCallback((address: string, label?: string) => {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return;
    if (trackedWallets.some(w => w.address === address)) return;

    const wallet: TrackedWallet = {
      id: `wt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      address,
      label: label || `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`,
      chain: 'solana',
      addedAt: Date.now(),
    };
    setTrackedWallets(prev => [...prev, wallet]);
  }, [trackedWallets]);

  const removeWallet = useCallback((id: string) => {
    setTrackedWallets(prev => prev.filter(w => w.id !== id));
    if (selectedWalletId === id) {
      setSelectedWalletId(null);
    }
  }, [selectedWalletId]);

  const updateLabel = useCallback((id: string, label: string) => {
    setTrackedWallets(prev => prev.map(w => w.id === id ? { ...w, label } : w));
  }, []);

  const selectWallet = useCallback((id: string | null) => {
    setSelectedWalletId(id);
  }, []);

  const updateSettings = useCallback((partial: Partial<TrackerSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const clearAlerts = useCallback(() => { setAlerts([]); }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const value: WalletTrackerContextType = {
    trackedWallets,
    selectedWalletId,
    holdings,
    trades,
    stats,
    alerts,
    isPolling,
    isLoading,
    settings,
    addWallet,
    removeWallet,
    updateLabel,
    selectWallet,
    refreshWallet,
    startPolling,
    stopPolling,
    updateSettings,
    clearAlerts,
    dismissAlert,
  };

  return (
    <WalletTrackerContext.Provider value={value}>
      {children}
    </WalletTrackerContext.Provider>
  );
}
