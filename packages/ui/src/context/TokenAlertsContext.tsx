/**
 * TokenAlertsContext — real-time PumpFun new token alert feed.
 *
 * Self-hosted: runs PumpPortal WebSocket directly in the browser.
 * Hosted: connects to /api/token-alerts/stream via SSE (Server-Sent Events).
 *
 * Alerts are persisted in localStorage and capped at 200 entries.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { NewTokenAlert, TokenAlertFilter } from '@trenchtools/core';

// ============ Types ============

export interface TokenAlertSettings {
  enabled: boolean;
  defaultBuyAmountSol: number;
  autoSafetyScan: boolean;
  soundEnabled: boolean;
  maxAlertsStored: number;
}

interface TokenAlertsContextType {
  alerts: NewTokenAlert[];
  isConnected: boolean;
  settings: TokenAlertSettings;
  filters: TokenAlertFilter;
  setEnabled: (enabled: boolean) => void;
  setFilters: (filters: TokenAlertFilter) => void;
  updateSettings: (partial: Partial<TokenAlertSettings>) => void;
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
}

// ============ Defaults ============

const DEFAULT_SETTINGS: TokenAlertSettings = {
  enabled: false,
  defaultBuyAmountSol: 0.05,
  autoSafetyScan: true,
  soundEnabled: false,
  maxAlertsStored: 200,
};

const DEFAULT_FILTERS: TokenAlertFilter = {};

// ============ Storage ============

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';

const STORAGE_KEYS = {
  alerts: 'trench_token_alerts_v1',
  settings: 'trench_token_alerts_settings_v1',
  filters: 'trench_token_alerts_filters_v1',
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

// ============ Context ============

const TokenAlertsContext = createContext<TokenAlertsContextType | null>(null);

export function useTokenAlerts(): TokenAlertsContextType {
  const ctx = useContext(TokenAlertsContext);
  if (!ctx) throw new Error('useTokenAlerts must be used within TokenAlertsProvider');
  return ctx;
}

export function TokenAlertsProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<NewTokenAlert[]>(() =>
    loadFromStorage<NewTokenAlert[]>(STORAGE_KEYS.alerts, []),
  );
  const [settings, setSettings] = useState<TokenAlertSettings>(() =>
    loadFromStorage<TokenAlertSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  );
  const [filters, setFiltersState] = useState<TokenAlertFilter>(() =>
    loadFromStorage<TokenAlertFilter>(STORAGE_KEYS.filters, DEFAULT_FILTERS),
  );
  const [isConnected, setIsConnected] = useState(false);

  // Refs for cleanup
  const connectionRef = useRef<{ close: () => void } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersRef = useRef(filters);
  const settingsRef = useRef(settings);

  // Keep refs in sync
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Debounced save (500ms)
  const scheduleSave = useCallback((key: string, data: unknown) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToStorage(key, data), 500);
  }, []);

  // Save alerts on change
  useEffect(() => {
    scheduleSave(STORAGE_KEYS.alerts, alerts);
  }, [alerts, scheduleSave]);

  // Save settings on change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.settings, settings);
  }, [settings]);

  // Save filters on change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.filters, filters);
  }, [filters]);

  // ============ Filter helper ============

  const matchesCurrentFilter = useCallback((alert: NewTokenAlert): boolean => {
    const f = filtersRef.current;
    if (f.minMarketCapSol != null && alert.marketCapSol < f.minMarketCapSol) return false;
    if (f.maxMarketCapSol != null && alert.marketCapSol > f.maxMarketCapSol) return false;
    if (f.minInitialBuySol != null && alert.initialBuySol < f.minInitialBuySol) return false;
    if (f.nameKeyword) {
      const kw = f.nameKeyword.toLowerCase();
      if (!alert.name.toLowerCase().includes(kw) && !alert.symbol.toLowerCase().includes(kw)) return false;
    }
    return true;
  }, []);

  // ============ Add alert ============

  const addAlert = useCallback((alert: NewTokenAlert) => {
    if (!matchesCurrentFilter(alert)) return;

    setAlerts((prev) => {
      const max = settingsRef.current.maxAlertsStored;
      const next = [alert, ...prev];
      return next.length > max ? next.slice(0, max) : next;
    });
  }, [matchesCurrentFilter]);

  // ============ Connection lifecycle ============

  useEffect(() => {
    if (!settings.enabled) {
      // Disconnect if disabled
      connectionRef.current?.close();
      connectionRef.current = null;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      return;
    }

    if (IS_HOSTED) {
      // Hosted mode: SSE
      const es = new EventSource('/api/token-alerts/stream');
      eventSourceRef.current = es;

      es.addEventListener('token', (event) => {
        try {
          const alert: NewTokenAlert = JSON.parse(event.data);
          addAlert(alert);
        } catch { /* ignore */ }
      });

      es.onopen = () => setIsConnected(true);
      es.onerror = () => setIsConnected(false);

      return () => {
        es.close();
        eventSourceRef.current = null;
        setIsConnected(false);
      };
    } else {
      // Self-hosted: direct WebSocket via core library
      let cancelled = false;

      (async () => {
        const { connectTokenStream } = await import('@trenchtools/core');
        if (cancelled) return;

        const conn = connectTokenStream({
          onAlert: (alert) => addAlert(alert),
          onConnectionChange: (connected) => setIsConnected(connected),
        });
        connectionRef.current = conn;
      })();

      return () => {
        cancelled = true;
        connectionRef.current?.close();
        connectionRef.current = null;
        setIsConnected(false);
      };
    }
  }, [settings.enabled, addAlert]);

  // ============ Actions ============

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => ({ ...prev, enabled }));
  }, []);

  const setFilters = useCallback((f: TokenAlertFilter) => {
    setFiltersState(f);
  }, []);

  const updateSettings = useCallback((partial: Partial<TokenAlertSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value: TokenAlertsContextType = {
    alerts,
    isConnected,
    settings,
    filters,
    setEnabled,
    setFilters,
    updateSettings,
    clearAlerts,
    dismissAlert,
  };

  return (
    <TokenAlertsContext.Provider value={value}>
      {children}
    </TokenAlertsContext.Provider>
  );
}
