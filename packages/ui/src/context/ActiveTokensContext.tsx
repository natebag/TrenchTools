import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

const STORAGE_KEY = 'trench_active_tokens';

export interface ActiveToken {
  mint: string;
  symbol?: string;
  name?: string;
  addedAt: number;
  source: 'volume' | 'snipe' | 'manual';
  pairAddress?: string;
  dexId?: string;
}

interface ActiveTokensContextType {
  tokens: ActiveToken[];
  addToken: (token: Omit<ActiveToken, 'addedAt'>) => void;
  removeToken: (mint: string) => void;
  clearTokens: () => void;
}

const ActiveTokensContext = createContext<ActiveTokensContextType | null>(null);

// Load tokens from localStorage
function loadTokens(): ActiveToken[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load active tokens from localStorage:', e);
  }
  return [];
}

// Save tokens to localStorage
function saveTokens(tokens: ActiveToken[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (e) {
    console.error('Failed to save active tokens to localStorage:', e);
  }
}

export function ActiveTokensProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<ActiveToken[]>(() => loadTokens());

  // Persist tokens to localStorage when they change
  useEffect(() => {
    saveTokens(tokens);
  }, [tokens]);

  const addToken = useCallback((token: Omit<ActiveToken, 'addedAt'>) => {
    setTokens(prev => {
      // Don't add duplicates
      if (prev.some(t => t.mint === token.mint)) {
        return prev;
      }
      return [...prev, { ...token, addedAt: Date.now() }];
    });
  }, []);

  const removeToken = useCallback((mint: string) => {
    setTokens(prev => prev.filter(t => t.mint !== mint));
  }, []);

  const clearTokens = useCallback(() => {
    setTokens([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ActiveTokensContext.Provider value={{ tokens, addToken, removeToken, clearTokens }}>
      {children}
    </ActiveTokensContext.Provider>
  );
}

export function useActiveTokens() {
  const ctx = useContext(ActiveTokensContext);
  if (!ctx) {
    throw new Error('useActiveTokens must be used within ActiveTokensProvider');
  }
  return ctx;
}
