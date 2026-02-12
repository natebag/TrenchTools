/**
 * Network Context - Solana network selection
 */
import { createContext, useContext, useState, ReactNode } from 'react';

export type Network = 'devnet' | 'mainnet';

interface NetworkContextType {
  network: Network;
  rpcUrl: string;
  setNetwork: (network: Network) => void;
}

const RPC_URLS: Record<Network, string> = {
  // Public RPCs that allow CORS from browsers
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://solana-rpc.publicnode.com',
};

const NetworkContext = createContext<NetworkContextType | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Load from localStorage or default to mainnet
  const [network, setNetworkState] = useState<Network>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('trench_network');
      if (saved === 'devnet' || saved === 'mainnet') return saved;
    }
    return 'mainnet';
  });

  const setNetwork = (newNetwork: Network) => {
    setNetworkState(newNetwork);
    localStorage.setItem('trench_network', newNetwork);
    // Reload to apply new network
    window.location.reload();
  };

  const rpcUrl = RPC_URLS[network];

  return (
    <NetworkContext.Provider value={{ network, rpcUrl, setNetwork }}>
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
