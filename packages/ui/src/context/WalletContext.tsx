/**
 * WalletContext - Production-grade state management
 * 
 * Features:
 * - localStorage persistence with schema validation
 * - Cross-tab sync via storage events
 * - Auto-save with 500ms debounce
 * - Type-safe state management
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Wallet, SniperConfig, TreasuryState, Settings, ActivityLog } from '@/types'

// ============ Schema Validation ============

const STORAGE_VERSION = 1;
const STORAGE_KEYS = {
  wallets: 'trench_wallets_v1',
  config: 'trench_config_v1',
  settings: 'trench_settings_v1',
  activity: 'trench_activity_v1',
} as const;

interface StorageSchema<T> {
  version: number;
  data: T;
  updatedAt: number;
}

function validateWallet(w: unknown): w is Wallet {
  if (!w || typeof w !== 'object') return false;
  const wallet = w as Record<string, unknown>;
  return (
    typeof wallet.id === 'string' &&
    typeof wallet.address === 'string' &&
    typeof wallet.name === 'string' &&
    typeof wallet.balance === 'number' &&
    typeof wallet.encrypted === 'boolean' &&
    ['sniper', 'treasury', 'burner'].includes(wallet.type as string)
  );
}

function validateSniperConfig(c: unknown): c is SniperConfig {
  if (!c || typeof c !== 'object') return false;
  const config = c as Record<string, unknown>;
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.minLiquidity === 'number' &&
    typeof config.maxSlippage === 'number' &&
    typeof config.gasMultiplier === 'number' &&
    typeof config.autoSell === 'boolean' &&
    typeof config.takeProfit === 'number' &&
    typeof config.stopLoss === 'number' &&
    typeof config.maxHoldingTime === 'number'
  );
}

function validateSettings(s: unknown): s is Settings {
  if (!s || typeof s !== 'object') return false;
  const settings = s as Record<string, unknown>;
  return (
    typeof settings.rpcUrl === 'string' &&
    typeof settings.chainId === 'number' &&
    typeof settings.apiKey === 'string' &&
    ['dark', 'light'].includes(settings.theme as string)
  );
}

function validateActivityLog(a: unknown): a is ActivityLog {
  if (!a || typeof a !== 'object') return false;
  const log = a as Record<string, unknown>;
  return (
    typeof log.id === 'string' &&
    (log.timestamp instanceof Date || typeof log.timestamp === 'string') &&
    ['buy', 'sell', 'fund', 'error', 'scan'].includes(log.type as string) &&
    typeof log.description === 'string'
  );
}

// ============ Storage Functions ============

function loadArrayFromStorage<T>(
  key: string,
  validator: (data: unknown) => data is T,
  defaultValue: T[]
): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    const parsed: StorageSchema<T[]> = JSON.parse(raw);
    
    // Version check
    if (parsed.version !== STORAGE_VERSION) {
      console.warn(`Storage version mismatch for ${key}, using defaults`);
      return defaultValue;
    }

    // Validate array data
    if (Array.isArray(parsed.data)) {
      const validated = parsed.data.filter(validator);
      if (validated.length !== parsed.data.length) {
        console.warn(`Some ${key} entries failed validation`);
      }
      return validated;
    }

    console.warn(`Invalid ${key} data (expected array), using defaults`);
    return defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return defaultValue;
  }
}

function loadFromStorage<T>(
  key: string,
  validator: (data: unknown) => data is T,
  defaultValue: T
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    const parsed: StorageSchema<T> = JSON.parse(raw);
    
    // Version check
    if (parsed.version !== STORAGE_VERSION) {
      console.warn(`Storage version mismatch for ${key}, using defaults`);
      return defaultValue;
    }

    if (validator(parsed.data)) {
      return parsed.data;
    }

    console.warn(`Invalid ${key} data, using defaults`);
    return defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
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

// ============ Default Values ============

const defaultSniperConfig: SniperConfig = {
  enabled: false,
  minLiquidity: 1,
  maxSlippage: 5,
  gasMultiplier: 1.5,
  autoSell: true,
  takeProfit: 200,
  stopLoss: 50,
  maxHoldingTime: 300,
};

const defaultTreasury: TreasuryState = {
  treasuryBalance: 0,
  allocatedToSnipers: 0,
  totalProfit: 0,
  totalLoss: 0,
  dailyVolume: 0,
};

const defaultSettings: Settings = {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  chainId: 101, // Mainnet
  apiKey: '',
  theme: 'dark',
};

const defaultWallets: Wallet[] = [];

// ============ Context Types ============

interface WalletContextType {
  // State
  wallets: Wallet[];
  treasury: TreasuryState;
  sniperConfig: SniperConfig;
  settings: Settings;
  activity: ActivityLog[];
  loading: boolean;

  // Wallet actions
  addWallet: (wallet: Omit<Wallet, 'id'>) => void;
  removeWallet: (id: string) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;
  fundWallet: (id: string, amount: number) => void;
  importWallets: (wallets: Omit<Wallet, 'id'>[]) => void;

  // Config actions
  updateSniperConfig: (config: Partial<SniperConfig>) => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updateTreasury: (treasury: Partial<TreasuryState>) => void;

  // Activity actions
  addActivity: (log: Omit<ActivityLog, 'id' | 'timestamp'>) => void;
  clearActivity: () => void;

  // Utility
  exportState: () => string;
  importState: (data: string) => boolean;
}

// ============ Context ============

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// ============ Provider ============

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Load initial state from localStorage
  const [wallets, setWallets] = useState<Wallet[]>(() =>
    loadArrayFromStorage(STORAGE_KEYS.wallets, validateWallet, defaultWallets)
  );

  const [sniperConfig, setSniperConfig] = useState<SniperConfig>(() =>
    loadFromStorage(STORAGE_KEYS.config, validateSniperConfig, defaultSniperConfig)
  );

  const [settings, setSettingsState] = useState<Settings>(() =>
    loadFromStorage(STORAGE_KEYS.settings, validateSettings, defaultSettings)
  );

  const [activity, setActivity] = useState<ActivityLog[]>(() => {
    const loaded = loadArrayFromStorage(STORAGE_KEYS.activity, validateActivityLog, []);
    // Convert date strings back to Date objects
    return loaded.map(a => ({
      ...a,
      timestamp: new Date(a.timestamp),
    }));
  });

  const [treasury, setTreasury] = useState<TreasuryState>(defaultTreasury);
  const [_loading, _setLoading] = useState(false);

  // Debounce timers
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Debounced save function
  const debouncedSave = useCallback(<T,>(key: string, data: T, delayMs = 500) => {
    const existingTimer = saveTimers.current.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      saveToStorage(key, data);
      saveTimers.current.delete(key);
    }, delayMs);

    saveTimers.current.set(key, timer);
  }, []);

  // Auto-save on state changes (debounced)
  useEffect(() => {
    debouncedSave(STORAGE_KEYS.wallets, wallets);
  }, [wallets, debouncedSave]);

  useEffect(() => {
    debouncedSave(STORAGE_KEYS.config, sniperConfig);
  }, [sniperConfig, debouncedSave]);

  useEffect(() => {
    debouncedSave(STORAGE_KEYS.settings, settings);
  }, [settings, debouncedSave]);

  useEffect(() => {
    debouncedSave(STORAGE_KEYS.activity, activity);
  }, [activity, debouncedSave]);

  // Cross-tab sync via storage event
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;

      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.version !== STORAGE_VERSION) return;

        switch (e.key) {
          case STORAGE_KEYS.wallets:
            if (Array.isArray(parsed.data)) {
              const validated = parsed.data.filter(validateWallet);
              setWallets(validated);
            }
            break;
          case STORAGE_KEYS.config:
            if (validateSniperConfig(parsed.data)) {
              setSniperConfig(parsed.data);
            }
            break;
          case STORAGE_KEYS.settings:
            if (validateSettings(parsed.data)) {
              setSettingsState(parsed.data);
            }
            break;
          case STORAGE_KEYS.activity:
            if (Array.isArray(parsed.data)) {
              const validated = parsed.data.filter(validateActivityLog).map((a: ActivityLog) => ({
                ...a,
                timestamp: new Date(a.timestamp),
              }));
              setActivity(validated);
            }
            break;
        }
      } catch (error) {
        console.error('Failed to sync from storage event:', error);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Sync from useSecureWallet via wallet-updated event (same-tab)
  useEffect(() => {
    const handleWalletUpdated = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.wallets);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.data)) return;
        const validated = parsed.data.filter(validateWallet);
        setWallets(validated);
      } catch (error) {
        console.error('Failed to sync from wallet-updated event:', error);
      }
    };

    window.addEventListener('wallet-updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet-updated', handleWalletUpdated);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      saveTimers.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  // ============ Actions ============

  const addWallet = useCallback((wallet: Omit<Wallet, 'id'>) => {
    const newWallet: Wallet = {
      ...wallet,
      id: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setWallets(prev => [...prev, newWallet]);
    addActivity({
      type: 'fund',
      description: `Added wallet: ${newWallet.name}`,
    });
  }, []);

  const removeWallet = useCallback((id: string) => {
    setWallets(prev => {
      const wallet = prev.find(w => w.id === id);
      if (wallet) {
        addActivity({
          type: 'fund',
          description: `Removed wallet: ${wallet.name}`,
        });
      }
      return prev.filter(w => w.id !== id);
    });
  }, []);

  const updateWallet = useCallback((id: string, updates: Partial<Wallet>) => {
    setWallets(prev => prev.map(w => (w.id === id ? { ...w, ...updates } : w)));
  }, []);

  const fundWallet = useCallback((id: string, amount: number) => {
    setWallets(prev => prev.map(w =>
      w.id === id ? { ...w, balance: w.balance + amount } : w
    ));
    setTreasury(prev => ({
      ...prev,
      allocatedToSnipers: prev.allocatedToSnipers + amount,
    }));
    const wallet = wallets.find(w => w.id === id);
    addActivity({
      type: 'fund',
      description: `Funded ${wallet?.name || 'wallet'} with ${amount} SOL`,
      amount,
    });
  }, [wallets]);

  const importWallets = useCallback((newWallets: Omit<Wallet, 'id'>[]) => {
    const walletsWithIds: Wallet[] = newWallets.map((w, i) => ({
      ...w,
      id: `wallet_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`,
    }));
    setWallets(prev => [...prev, ...walletsWithIds]);
    addActivity({
      type: 'fund',
      description: `Imported ${walletsWithIds.length} wallets`,
    });
  }, []);

  const updateSniperConfig = useCallback((config: Partial<SniperConfig>) => {
    setSniperConfig(prev => ({ ...prev, ...config }));
  }, []);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettingsState(prev => ({ ...prev, ...newSettings }));
  }, []);

  const updateTreasury = useCallback((updates: Partial<TreasuryState>) => {
    setTreasury(prev => ({ ...prev, ...updates }));
  }, []);

  const addActivity = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    const newLog: ActivityLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setActivity(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  const clearActivity = useCallback(() => {
    setActivity([]);
  }, []);

  // ============ Export/Import ============

  const exportState = useCallback((): string => {
    const state = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      wallets: wallets.map(w => ({ ...w, privateKey: undefined })), // Don't export private keys
      sniperConfig,
      settings: { ...settings, encryptionPassword: undefined }, // Don't export password
      treasury,
    };
    return JSON.stringify(state, null, 2);
  }, [wallets, sniperConfig, settings, treasury]);

  const importState = useCallback((data: string): boolean => {
    try {
      const parsed = JSON.parse(data);
      
      if (parsed.wallets && Array.isArray(parsed.wallets)) {
        const validWallets = parsed.wallets.filter(validateWallet);
        setWallets(validWallets);
      }
      
      if (parsed.sniperConfig && validateSniperConfig(parsed.sniperConfig)) {
        setSniperConfig(parsed.sniperConfig);
      }
      
      if (parsed.settings && validateSettings(parsed.settings)) {
        setSettingsState(parsed.settings);
      }
      
      if (parsed.treasury) {
        setTreasury(prev => ({ ...prev, ...parsed.treasury }));
      }

      addActivity({
        type: 'fund',
        description: 'Imported configuration',
      });

      return true;
    } catch (error) {
      console.error('Failed to import state:', error);
      return false;
    }
  }, []);

  // ============ Context Value ============

  const value: WalletContextType = {
    wallets,
    treasury,
    sniperConfig,
    settings,
    activity,
    loading: _loading,
    addWallet,
    removeWallet,
    updateWallet,
    fundWallet,
    importWallets,
    updateSniperConfig,
    updateSettings,
    updateTreasury,
    addActivity,
    clearActivity,
    exportState,
    importState,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// ============ Hook ============

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
