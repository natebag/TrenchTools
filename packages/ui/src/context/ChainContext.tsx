/**
 * Chain Context — multi-chain selection and state management
 *
 * Manages which chain is currently selected across the entire UI.
 * Wraps existing NetworkContext (Solana-specific network switching stays intact).
 * Persists selection to localStorage.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  type ChainId,
  type ChainConfig,
  type ChainFeatures,
  CHAINS,
  ACTIVE_CHAIN_IDS,
  CHAIN_FEATURES,
  getExplorerUrl,
  getNativeToken,
  getNativeDecimals,
} from '@trenchtools/core';

// ── Context Shape ──

interface ChainContextValue {
  /** Currently selected chain */
  chain: ChainId;
  /** Full configuration for the selected chain */
  chainConfig: ChainConfig;
  /** Feature flags for the selected chain */
  features: ChainFeatures;
  /** All active (implemented) chain IDs */
  activeChains: ChainId[];
  /** Switch to a different chain */
  setChain: (chain: ChainId) => void;
  /** Native token balance for the primary wallet on the selected chain */
  nativeBalance: number | null;
  /** Whether balance is currently loading */
  balanceLoading: boolean;
  /** Trigger a balance refresh */
  refreshBalance: () => void;
  /** Convenience: build an explorer link */
  explorerUrl: (type: 'tx' | 'address' | 'token', hash: string) => string;
  /** Convenience: native token symbol (e.g. "SOL", "BNB") */
  nativeToken: string;
  /** Convenience: native token decimals */
  nativeDecimals: number;
}

const STORAGE_KEY = 'trench_selected_chain';

const ChainContext = createContext<ChainContextValue | null>(null);

// ── Provider ──

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved in CHAINS && ACTIVE_CHAIN_IDS.includes(saved as ChainId)) {
        return saved as ChainId;
      }
    }
    return 'solana';
  });

  const [nativeBalance, setNativeBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const chainConfig = CHAINS[chain];
  const features = CHAIN_FEATURES[chain];

  const setChain = useCallback((newChain: ChainId) => {
    if (!ACTIVE_CHAIN_IDS.includes(newChain)) return;
    setChainState(newChain);
    localStorage.setItem(STORAGE_KEY, newChain);
    setNativeBalance(null);
    // Notify other components about chain change
    window.dispatchEvent(new CustomEvent('chain-changed', { detail: { chain: newChain } }));
  }, []);

  const refreshBalance = useCallback(() => {
    setRefreshCounter(c => c + 1);
  }, []);

  // Fetch native balance for the selected chain + primary wallet
  useEffect(() => {
    let cancelled = false;

    const fetchBalance = async () => {
      try {
        const activeWalletStr = localStorage.getItem('trench_active_wallet');
        if (!activeWalletStr) {
          setNativeBalance(null);
          return;
        }

        const activeWallet = JSON.parse(activeWalletStr);
        if (!activeWallet?.address) {
          setNativeBalance(null);
          return;
        }

        setBalanceLoading(true);

        if (chain === 'solana') {
          // Use existing Solana balance fetching
          const { Connection, PublicKey } = await import('@solana/web3.js');
          const customRpc = localStorage.getItem('trench_custom_rpc');
          const rpcUrl = customRpc || chainConfig.defaultRpcUrl;
          const conn = new Connection(rpcUrl, 'confirmed');
          const balance = await conn.getBalance(new PublicKey(activeWallet.address));
          if (!cancelled) {
            setNativeBalance(balance / 1e9);
          }
        } else if (chainConfig.family === 'evm') {
          // Use viem for EVM balance
          const { createPublicClient, http, formatEther } = await import('viem');
          const rpcUrl = localStorage.getItem(`trench_rpc_${chain}`) || chainConfig.defaultRpcUrl;
          const client = createPublicClient({ transport: http(rpcUrl) });
          const balance = await client.getBalance({ address: activeWallet.address as `0x${string}` });
          if (!cancelled) {
            setNativeBalance(parseFloat(formatEther(balance)));
          }
        }
      } catch (err) {
        console.error(`[ChainContext] Balance fetch error (${chain}):`, err);
        if (!cancelled) setNativeBalance(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };

    fetchBalance();

    // Re-fetch on wallet changes
    const handleWalletUpdate = () => fetchBalance();
    window.addEventListener('wallet-updated', handleWalletUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener('wallet-updated', handleWalletUpdate);
    };
  }, [chain, chainConfig, refreshCounter]);

  const explorerUrlFn = useCallback(
    (type: 'tx' | 'address' | 'token', hash: string) => getExplorerUrl(chain, type, hash),
    [chain],
  );

  return (
    <ChainContext.Provider
      value={{
        chain,
        chainConfig,
        features,
        activeChains: ACTIVE_CHAIN_IDS,
        setChain,
        nativeBalance,
        balanceLoading,
        refreshBalance,
        explorerUrl: explorerUrlFn,
        nativeToken: getNativeToken(chain),
        nativeDecimals: getNativeDecimals(chain),
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

// ── Hook ──

export function useChain() {
  const context = useContext(ChainContext);
  if (!context) {
    throw new Error('useChain must be used within ChainProvider');
  }
  return context;
}
