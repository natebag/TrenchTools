/**
 * Network Context - Solana network selection
 */
import { createContext, useContext, useState, ReactNode } from 'react';

export type Network = 'devnet' | 'mainnet';

interface NetworkContextType {
  network: Network;
  rpcUrl: string;
  defaultRpcUrl: string;
  customRpcUrl: string | null;
  isCustomRpc: boolean;
  setNetwork: (network: Network) => void;
  setCustomRpcUrl: (rpcUrl: string | null) => void;
  clearCustomRpc: () => void;
}

const RPC_URLS: Record<Network, string> = {
  // Public RPCs that allow CORS from browsers
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://solana-rpc.publicnode.com',
};

const STORAGE_KEYS = {
  network: 'trench_network',
  customRpc: 'trench_custom_rpc',
} as const;

const NetworkContext = createContext<NetworkContextType | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Load from localStorage or default to mainnet
  const [network, setNetworkState] = useState<Network>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEYS.network);
      if (saved === 'devnet' || saved === 'mainnet') return saved;
    }
    return 'mainnet';
  });
  const [customRpcUrl, setCustomRpcUrlState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(STORAGE_KEYS.customRpc);
    return saved && saved.trim() ? saved.trim() : null;
  });

  const setNetwork = (newNetwork: Network) => {
    setNetworkState(newNetwork);
    localStorage.setItem(STORAGE_KEYS.network, newNetwork);
    // Reload to apply new network
    window.location.reload();
  };

  const setCustomRpcUrl = (rpcUrl: string | null) => {
    const nextUrl = rpcUrl?.trim() || null;
    setCustomRpcUrlState(nextUrl);

    if (nextUrl) {
      localStorage.setItem(STORAGE_KEYS.customRpc, nextUrl);
      return;
    }

    localStorage.removeItem(STORAGE_KEYS.customRpc);
  };

  const clearCustomRpc = () => {
    setCustomRpcUrl(null);
  };

  const defaultRpcUrl = RPC_URLS[network];
  const rpcUrl = customRpcUrl ?? defaultRpcUrl;
  const isCustomRpc = customRpcUrl !== null;

  return (
    <NetworkContext.Provider
      value={{
        network,
        rpcUrl,
        defaultRpcUrl,
        customRpcUrl,
        isCustomRpc,
        setNetwork,
        setCustomRpcUrl,
        clearCustomRpc,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
}
