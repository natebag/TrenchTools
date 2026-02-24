/**
 * WalletTrackerContext — track wallets, view holdings/trades/stats, copy-trade.
 *
 * Self-hosted: imports fetchHoldings/fetchTrades/calculateStats from core.
 * Hosted: fetches from /api/wallet-tracker/* endpoints.
 *
 * Copy-trade: when a tracked wallet buys/sells, auto-execute the same trade
 * with the user's wallet at a fixed SOL amount.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import { useNetwork } from '@/context/NetworkContext';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import {
  getQuote as dexGetQuote,
  executeSwap as dexExecuteSwap,
  type DexConfig,
} from '@/lib/dex';
import { getBondingCurveAddress } from '@/lib/dex/pumpfun';
import type {
  TrackedWallet,
  WalletHolding,
  WalletTrade,
  TraderStats,
  WalletTradeAlert,
  CopyTradeConfig,
  CopyTradeExecution,
} from '@trenchtools/core';
import { DEFAULT_COPY_TRADE_CONFIG } from '@trenchtools/core';

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

  // Copy-trade
  copyConfigs: Record<string, CopyTradeConfig>;
  copyHistory: CopyTradeExecution[];

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

  // Copy-trade actions
  updateCopyConfig: (walletAddress: string, partial: Partial<CopyTradeConfig>) => void;
  clearCopyHistory: () => void;
}

// ============ Defaults ============

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const MAX_COPY_HISTORY = 200;

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
  copyConfigs: 'trench_wallet_tracker_copy_configs_v1',
  copyHistory: 'trench_wallet_tracker_copy_history_v1',
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

// ============ Copy-Trade Helpers ============

/** Detect whether a token is on PumpFun bonding curve (not graduated) */
async function detectUsePumpFun(mint: string, rpcUrl: string): Promise<boolean> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const mintPubkey = new PublicKey(mint);
    const bondingCurve = getBondingCurveAddress(mintPubkey);
    const accountInfo = await connection.getAccountInfo(bondingCurve);
    if (accountInfo && accountInfo.data && accountInfo.data.length >= 49) {
      const complete = (accountInfo.data as Buffer).readUInt8(48) === 1;
      return !complete;
    }
    return false;
  } catch {
    return false;
  }
}

/** Get user's token balance for a specific mint (for sell copy) */
async function getTokenBalance(connection: Connection, owner: PublicKey, mint: string): Promise<{ raw: number; decimals: number }> {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: SPL_TOKEN_PROGRAM_ID,
    });
    for (const { account } of accounts.value) {
      const info = account.data.parsed.info;
      if (info.mint === mint) {
        const amount = parseInt(info.tokenAmount.amount);
        return { raw: amount, decimals: info.tokenAmount.decimals };
      }
    }
    return { raw: 0, decimals: 0 };
  } catch {
    return { raw: 0, decimals: 0 };
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
  const { getKeypairs, isLocked } = useSecureWallet({ rpcUrl });

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

  // Copy-trade state
  const [copyConfigs, setCopyConfigs] = useState<Record<string, CopyTradeConfig>>(() =>
    loadFromStorage<Record<string, CopyTradeConfig>>(STORAGE_KEYS.copyConfigs, {}),
  );
  const [copyHistory, setCopyHistory] = useState<CopyTradeExecution[]>(() =>
    loadFromStorage<CopyTradeExecution[]>(STORAGE_KEYS.copyHistory, []),
  );

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownSignatures = useRef(new Set<string>());
  const settingsRef = useRef(settings);

  // Copy-trade refs
  const firstPollRef = useRef(true);
  const copiedSignatures = useRef(new Set<string>());
  const copyRateLimiter = useRef(new Map<string, number[]>());
  const copyConfigsRef = useRef(copyConfigs);
  const isLockedRef = useRef(isLocked);
  const getKeypairsRef = useRef(getKeypairs);
  const rpcUrlRef = useRef(rpcUrl);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { copyConfigsRef.current = copyConfigs; }, [copyConfigs]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { getKeypairsRef.current = getKeypairs; }, [getKeypairs]);
  useEffect(() => { rpcUrlRef.current = rpcUrl; }, [rpcUrl]);

  // Debounced save
  const scheduleSave = useCallback((key: string, data: unknown) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToStorage(key, data), 500);
  }, []);

  // Auto-save
  useEffect(() => { scheduleSave(STORAGE_KEYS.wallets, trackedWallets); }, [trackedWallets, scheduleSave]);
  useEffect(() => { scheduleSave(STORAGE_KEYS.alerts, alerts); }, [alerts, scheduleSave]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.settings, settings); }, [settings]);
  useEffect(() => { scheduleSave(STORAGE_KEYS.copyConfigs, copyConfigs); }, [copyConfigs, scheduleSave]);
  useEffect(() => { scheduleSave(STORAGE_KEYS.copyHistory, copyHistory); }, [copyHistory, scheduleSave]);

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

  // ============ Copy-Trade Execution ============

  const executeCopyTrade = useCallback(async (
    wallet: TrackedWallet,
    trade: WalletTrade,
    config: CopyTradeConfig,
  ) => {
    const execution: CopyTradeExecution = {
      id: `ct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      trackedWalletAddress: wallet.address,
      trackedWalletLabel: wallet.label,
      originalSignature: trade.signature,
      tokenMint: trade.tokenMint,
      tokenSymbol: trade.tokenSymbol,
      type: trade.type,
      amountSol: config.amountSol,
      status: 'pending',
      timestamp: Date.now(),
    };

    // Add pending execution
    setCopyHistory(prev => {
      const next = [execution, ...prev];
      return next.length > MAX_COPY_HISTORY ? next.slice(0, MAX_COPY_HISTORY) : next;
    });

    try {
      // Check vault is unlocked
      if (isLockedRef.current) {
        throw new Error('Vault is locked — unlock to enable copy-trading');
      }

      const keypairs = getKeypairsRef.current();
      if (keypairs.length === 0) {
        throw new Error('No wallets available');
      }

      const signer: Keypair = keypairs[0]; // Use first wallet
      const currentRpcUrl = rpcUrlRef.current;
      const connection = new Connection(currentRpcUrl, 'confirmed');

      // Check SOL balance
      const balance = await connection.getBalance(signer.publicKey);
      const balanceSol = balance / LAMPORTS_PER_SOL;
      if (trade.type === 'buy' && balanceSol < config.amountSol + 0.01) {
        throw new Error(`Insufficient SOL: ${balanceSol.toFixed(4)} < ${config.amountSol + 0.01}`);
      }

      // Auto-detect DEX from trade source
      const usePumpFun = trade.source?.toUpperCase().includes('PUMP')
        ? await detectUsePumpFun(trade.tokenMint, currentRpcUrl)
        : false;
      const dexType = usePumpFun ? 'pumpfun' : 'jupiter';

      const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
      const heliusApiKey = localStorage.getItem('trench_helius_key') || undefined;
      const dexConfig: DexConfig = {
        rpcUrl: currentRpcUrl,
        apiKey: dexType === 'jupiter' ? jupiterApiKey : undefined,
        slippageBps: config.slippageBps,
        heliusApiKey,
      };

      let txHash: string | undefined;

      if (trade.type === 'buy') {
        const amountLamports = Math.floor(config.amountSol * LAMPORTS_PER_SOL);
        const quote = await dexGetQuote(dexType, WSOL_MINT, trade.tokenMint, amountLamports, dexConfig);
        const result = await dexExecuteSwap(quote, signer, dexConfig);
        if (!result.success) throw new Error(result.error || 'Buy swap failed');
        txHash = result.txHash;
      } else {
        // Sell: sell entire balance of this token
        const { raw: tokenBalance } = await getTokenBalance(connection, signer.publicKey, trade.tokenMint);
        if (tokenBalance === 0) {
          throw new Error('No token balance to sell');
        }

        const quote = await dexGetQuote(dexType, trade.tokenMint, WSOL_MINT, tokenBalance, dexConfig);
        const result = await dexExecuteSwap(quote, signer, dexConfig);
        if (!result.success) throw new Error(result.error || 'Sell swap failed');
        txHash = result.txHash;
      }

      // Update execution to success
      setCopyHistory(prev =>
        prev.map(e => e.id === execution.id ? { ...e, status: 'success' as const, copySignature: txHash } : e),
      );

      console.log(`[CopyTrade] ${trade.type} ${trade.tokenSymbol} via ${dexType} — tx: ${txHash}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[CopyTrade] Failed to copy ${trade.type} ${trade.tokenSymbol}:`, errorMsg);

      setCopyHistory(prev =>
        prev.map(e => e.id === execution.id ? { ...e, status: 'failed' as const, error: errorMsg } : e),
      );
    }
  }, []);

  // ============ Polling for Trade Alerts + Copy-Trade ============

  const pollForAlerts = useCallback(async () => {
    const isFirstPoll = firstPollRef.current;

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

          // First-poll guard: seed knownSignatures only, don't generate alerts or copies
          if (isFirstPoll) continue;

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

          // ── Copy-Trade Logic ──
          const copyConfig = copyConfigsRef.current[wallet.address];
          if (!copyConfig?.enabled) continue;
          if (trade.type === 'buy' && !copyConfig.copyBuys) continue;
          if (trade.type === 'sell' && !copyConfig.copySells) continue;

          // Dedup: already copied this signature?
          if (copiedSignatures.current.has(trade.signature)) continue;

          // Rate limit: max copies per minute for this wallet
          const now = Date.now();
          const timestamps = copyRateLimiter.current.get(wallet.address) || [];
          const recentTimestamps = timestamps.filter(t => now - t < 60_000);
          if (recentTimestamps.length >= copyConfig.maxCopiesPerMinute) {
            console.log(`[CopyTrade] Rate limit hit for ${wallet.label} (${recentTimestamps.length}/${copyConfig.maxCopiesPerMinute} per min)`);
            continue;
          }

          // Mark as copied and update rate limiter
          copiedSignatures.current.add(trade.signature);
          recentTimestamps.push(now);
          copyRateLimiter.current.set(wallet.address, recentTimestamps);

          // Limit copiedSignatures buffer
          if (copiedSignatures.current.size > 2000) {
            const arr = Array.from(copiedSignatures.current);
            copiedSignatures.current = new Set(arr.slice(-1000));
          }

          // Fire-and-forget copy execution
          executeCopyTrade(wallet, trade, copyConfig);
        }
      } catch (err) {
        console.error(`Poll error for ${wallet.address}:`, err);
      }
    }

    // Mark first poll as done
    if (isFirstPoll) {
      firstPollRef.current = false;
    }
  }, [trackedWallets, executeCopyTrade]);

  // ============ Polling Lifecycle ============

  const startPolling = useCallback(() => {
    if (pollingRef.current || trackedWallets.length === 0) return;
    setIsPolling(true);
    firstPollRef.current = true; // Reset first-poll guard on fresh start
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

  // Copy-trade actions
  const updateCopyConfig = useCallback((walletAddress: string, partial: Partial<CopyTradeConfig>) => {
    setCopyConfigs(prev => {
      const existing = prev[walletAddress] || { ...DEFAULT_COPY_TRADE_CONFIG };
      return { ...prev, [walletAddress]: { ...existing, ...partial } };
    });
  }, []);

  const clearCopyHistory = useCallback(() => { setCopyHistory([]); }, []);

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
    copyConfigs,
    copyHistory,
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
    updateCopyConfig,
    clearCopyHistory,
  };

  return (
    <WalletTrackerContext.Provider value={value}>
      {children}
    </WalletTrackerContext.Provider>
  );
}
