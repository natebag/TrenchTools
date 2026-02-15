/**
 * useSecureWallet Hook
 * 
 * React hook for browser-based encrypted wallet management
 * Uses Web Crypto API - no Node.js dependencies
 */

import { useState, useCallback, useEffect } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getWalletManager,
  type SecureWallet,
} from '@/lib/browserWallet';

// ============ Types ============

export interface UseSecureWalletOptions {
  rpcUrl?: string;
  autoFetchBalances?: boolean;
}

export interface UseSecureWalletReturn {
  // State
  wallets: SecureWallet[];
  isLocked: boolean;
  hasVault: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  generateWallet: (name: string, type: 'sniper' | 'treasury' | 'burner', password: string) => Promise<SecureWallet>;
  generateWallets: (count: number, prefix: string, type: 'sniper' | 'treasury' | 'burner', password: string) => Promise<SecureWallet[]>;
  importWallet: (secretKey: Uint8Array, name: string, type: 'sniper' | 'treasury' | 'burner', password: string) => Promise<SecureWallet>;
  removeWallet: (walletId: string, password: string) => Promise<void>;
  refreshBalances: () => Promise<void>;
  exportBackup: (password: string) => Promise<string>;
  importBackup: (backup: string, password: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteVault: () => void;
  clearError: () => void;
  getKeypairs: () => import('@solana/web3.js').Keypair[];
}

// ============ Hook ============

export function useSecureWallet(options: UseSecureWalletOptions = {}): UseSecureWalletReturn {
  const {
    rpcUrl = 'https://api.mainnet-beta.solana.com',
    autoFetchBalances = true,
  } = options;
  
  const [wallets, setWallets] = useState<SecureWallet[]>([]);
  const [isLocked, setIsLocked] = useState(true);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const manager = getWalletManager();
  // Connection is created fresh in refreshBalances to use current rpcUrl
  
  // Initialize state from manager
  useEffect(() => {
    const state = manager.getState();
    setIsLocked(state.isLocked);
    setHasVault(state.hasVault);

    if (!state.isLocked) {
      const unlockedWallets = manager.getUnlockedWallets();
      setWallets(unlockedWallets as SecureWallet[]);
    } else {
      setWallets([]);
    }
  }, [manager]);
  
  // Fetch balances for all wallets
  const refreshBalances = useCallback(async () => {
    console.log('[TrenchSniper] Refreshing balances, RPC:', rpcUrl);
    
    setWallets(currentWallets => {
      if (currentWallets.length === 0) {
        console.log('[TrenchSniper] No wallets to refresh');
        return currentWallets;
      }
      
      console.log('[TrenchSniper] Fetching for', currentWallets.length, 'wallets');
      
      // Fetch balances async and update
      Promise.all(
        currentWallets.map(async (wallet) => {
          try {
            console.log('[TrenchSniper] Fetching balance for:', wallet.address);
            const pubkey = new PublicKey(wallet.address);
            const conn = new Connection(rpcUrl, 'confirmed');
            const balance = await conn.getBalance(pubkey);
            console.log('[TrenchSniper] Got balance:', balance / LAMPORTS_PER_SOL, 'SOL');
            return {
              ...wallet,
              balance: balance / LAMPORTS_PER_SOL,
            };
          } catch (err) {
            console.error('[TrenchSniper] Balance fetch error:', err);
            return wallet;
          }
        })
      ).then(updatedWallets => {
        console.log('[TrenchSniper] Setting updated wallets');
        setWallets(updatedWallets);
      });
      
      return currentWallets;
    });
  }, [rpcUrl]);
  
  // Auto-fetch balances when unlocked or wallets change
  useEffect(() => {
    if (!isLocked && autoFetchBalances && wallets.length > 0) {
      // Small delay to ensure state is settled
      const timer = setTimeout(() => {
        refreshBalances();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked, wallets.length, autoFetchBalances, rpcUrl]);
  
  // Sync active wallet to localStorage for header display
  useEffect(() => {
    if (!isLocked && wallets.length > 0) {
      const activeWallet = wallets[0]; // Use first wallet as active
      localStorage.setItem('trench_active_wallet', JSON.stringify({
        address: activeWallet.address,
        balance: activeWallet.balance || 0,
        name: activeWallet.name
      }));
      // Save all wallets for account switcher
      localStorage.setItem('trench_all_wallets', JSON.stringify(
        wallets.map(w => ({
          address: w.address,
          balance: w.balance || 0,
          name: w.name,
          type: w.type
        }))
      ));
      // Dispatch event for header to update
      window.dispatchEvent(new Event('wallet-updated'));
    } else if (isLocked) {
      localStorage.removeItem('trench_active_wallet');
      localStorage.removeItem('trench_all_wallets');
      window.dispatchEvent(new Event('wallet-updated'));
    }
  }, [isLocked, wallets]);

  // Unlock vault
  const unlock = useCallback(async (password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const loadedWallets = await manager.unlock(password);
      setWallets(loadedWallets as SecureWallet[]);
      setIsLocked(false);
      setHasVault(true);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Lock vault
  const lock = useCallback(() => {
    manager.lock();
    setWallets([]);
    setIsLocked(true);
  }, [manager]);
  
  // Generate single wallet
  const generateWallet = useCallback(async (
    name: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<SecureWallet> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const wallet = await manager.generateWallet(name, type, password);
      const secureWallet = wallet as SecureWallet;
      setWallets(prev => [...prev, secureWallet]);
      setHasVault(true);
      setIsLocked(false);
      return secureWallet;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Generate multiple wallets
  const generateWallets = useCallback(async (
    count: number,
    prefix: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<SecureWallet[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newWallets = await manager.generateWallets(count, prefix, type, password);
      const secureWallets = newWallets as SecureWallet[];
      setWallets(prev => [...prev, ...secureWallets]);
      setHasVault(true);
      setIsLocked(false);
      return secureWallets;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Import wallet from secret key
  const importWallet = useCallback(async (
    secretKey: Uint8Array,
    name: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<SecureWallet> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const wallet = await manager.importWallet(secretKey, name, type, password);
      const secureWallet = wallet as SecureWallet;
      setWallets(prev => [...prev, secureWallet]);
      setHasVault(true);
      setIsLocked(false);
      return secureWallet;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Remove wallet
  const removeWallet = useCallback(async (walletId: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await manager.removeWallet(walletId, password);
      setWallets(prev => prev.filter(w => w.id !== walletId));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Export backup
  const exportBackup = useCallback(async (password: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      return await manager.exportBackup(password);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Import backup
  const importBackup = useCallback(async (backup: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const importedWallets = await manager.importBackup(backup, password);
      setWallets(importedWallets as SecureWallet[]);
      setHasVault(true);
      setIsLocked(false);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Change password
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await manager.changePassword(oldPassword, newPassword);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  
  // Delete vault
  const deleteVault = useCallback(() => {
    manager.deleteVault();
    setWallets([]);
    setIsLocked(true);
    setHasVault(false);
  }, [manager]);
  
  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Get all keypairs for signing (must be unlocked)
  const getKeypairs = useCallback(() => {
    return manager.getAllKeypairs();
  }, [manager]);
  
  return {
    wallets,
    isLocked,
    hasVault,
    isLoading,
    error,
    unlock,
    lock,
    generateWallet,
    generateWallets,
    importWallet,
    removeWallet,
    refreshBalances,
    exportBackup,
    importBackup,
    changePassword,
    deleteVault,
    clearError,
    getKeypairs,
  };
}

export default useSecureWallet;
