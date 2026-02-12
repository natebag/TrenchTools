/**
 * TreasuryWalletManager - DEX-style wallet management
 * Treasury wallet at top with linked sub-wallets below
 */

import { useState, useCallback, useRef } from 'react';
import {
  Wallet,
  Lock,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  AlertCircle,
  Loader2,
  CheckCircle,
  Shield,
  ArrowDown,
  ArrowUp,
  Crown,
  Zap,
  History,
  ExternalLink,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, ParsedTransactionWithMeta } from '@solana/web3.js';

// Transaction history types
interface TransactionInfo {
  signature: string;
  timestamp: number | null;
  type: 'send' | 'receive' | 'unknown';
  amount: number; // in SOL
  counterparty: string | null;
}

interface TxHistoryCache {
  [address: string]: {
    transactions: TransactionInfo[];
    fetchedAt: number;
  };
}

export function TreasuryWalletManager() {
  const { rpcUrl, network } = useNetwork();
  const {
    wallets,
    isLocked,
    hasVault,
    isLoading,
    error: walletError,
    unlock,
    lock,
    generateWallet,
    importWallet,
    removeWallet,
    refreshBalances,
    clearError,
    getKeypairs,
  } = useSecureWallet({ rpcUrl });

  // UI State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCreateVaultModal, setShowCreateVaultModal] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundTarget, setFundTarget] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState('0.01');
  const [newWalletName, setNewWalletName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [isFunding, setIsFunding] = useState(false);
  const [fundTxHash, setFundTxHash] = useState<string | null>(null);
  
  // Transaction history state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyWallet, setHistoryWallet] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTransactions, setHistoryTransactions] = useState<TransactionInfo[]>([]);
  const txHistoryCache = useRef<TxHistoryCache>({});
  const CACHE_TTL = 60000; // 1 minute cache
  const [isBulkFunding, setIsBulkFunding] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepingWalletId, setSweepingWalletId] = useState<string | null>(null);

  // Constants
  const RENT_RESERVE = 0.005; // SOL to leave for rent exemption

  // Get treasury wallet (first treasury type, or first wallet)
  const treasuryWallet = wallets.find(w => w.type === 'treasury') || wallets[0];
  const subWallets = wallets.filter(w => w.id !== treasuryWallet?.id);

  // Fetch transaction history for a wallet
  const fetchTransactionHistory = useCallback(async (address: string, forceRefresh = false) => {
    // Check cache first
    const cached = txHistoryCache.current[address];
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setHistoryTransactions(cached.transactions);
      return;
    }

    setHistoryLoading(true);
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const pubkey = new PublicKey(address);

      // Get recent signatures (limit to 15)
      const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 15 });
      
      if (signatures.length === 0) {
        setHistoryTransactions([]);
        txHistoryCache.current[address] = { transactions: [], fetchedAt: Date.now() };
        return;
      }

      // Fetch parsed transactions
      const txInfos: TransactionInfo[] = [];

      for (const sig of signatures) {
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta) continue;

          // Analyze the transaction to determine type and amount
          const txInfo = analyzeTransaction(tx, address);
          txInfos.push({
            signature: sig.signature,
            timestamp: sig.blockTime ?? null,
            ...txInfo,
          });
        } catch {
          // Skip failed transaction fetches
          continue;
        }
      }

      // Update state and cache
      setHistoryTransactions(txInfos);
      txHistoryCache.current[address] = { transactions: txInfos, fetchedAt: Date.now() };
    } catch (err) {
      console.error('Failed to fetch transaction history:', err);
      setError('Failed to load transaction history');
    } finally {
      setHistoryLoading(false);
    }
  }, [rpcUrl]);

  // Analyze a parsed transaction to extract type, amount, counterparty
  const analyzeTransaction = (
    tx: ParsedTransactionWithMeta,
    walletAddress: string
  ): { type: 'send' | 'receive' | 'unknown'; amount: number; counterparty: string | null } => {
    const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
    const walletIndex = accountKeys.indexOf(walletAddress);
    
    if (walletIndex === -1 || !tx.meta) {
      return { type: 'unknown', amount: 0, counterparty: null };
    }

    const preBalance = tx.meta.preBalances[walletIndex] || 0;
    const postBalance = tx.meta.postBalances[walletIndex] || 0;
    const diff = (postBalance - preBalance) / LAMPORTS_PER_SOL;

    // Determine type based on balance change
    let type: 'send' | 'receive' | 'unknown' = 'unknown';
    if (diff > 0.00001) {
      type = 'receive';
    } else if (diff < -0.00001) {
      type = 'send';
    }

    // Try to find counterparty (simplified: check for transfer instructions)
    let counterparty: string | null = null;
    const instructions = tx.transaction.message.instructions;
    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (type === 'send' && info.destination && info.destination !== walletAddress) {
          counterparty = info.destination;
          break;
        } else if (type === 'receive' && info.source && info.source !== walletAddress) {
          counterparty = info.source;
          break;
        }
      }
    }

    return { type, amount: Math.abs(diff), counterparty };
  };

  // Open history modal for a wallet
  const openHistory = useCallback((walletAddress: string) => {
    setHistoryWallet(walletAddress);
    setShowHistoryModal(true);
    setHistoryTransactions([]);
    fetchTransactionHistory(walletAddress);
  }, [fetchTransactionHistory]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`${label} copied!`);
    setTimeout(() => setSuccess(null), 2000);
  }, []);

  const handleCreateVault = useCallback(async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    try {
      // Create treasury wallet first
      await generateWallet('Treasury', 'treasury', password);
      setShowCreateVaultModal(false);
      setPassword('');
      setConfirmPassword('');
      setSuccess('Vault created with Treasury wallet!');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [password, confirmPassword, generateWallet]);

  const handleUnlock = useCallback(async () => {
    try {
      await unlock(password);
      setPassword('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [password, unlock]);

  const handleAddSubWallet = useCallback(async () => {
    if (!newWalletName) {
      setError('Wallet name required');
      return;
    }
    try {
      if (importKey) {
        const keyArray = JSON.parse(importKey);
        await importWallet(new Uint8Array(keyArray), newWalletName, 'sniper', password);
      } else {
        await generateWallet(newWalletName, 'sniper', password);
      }
      setShowAddWalletModal(false);
      setNewWalletName('');
      setImportKey('');
      setSuccess('Sub-wallet added!');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [newWalletName, importKey, password, generateWallet, importWallet]);

  // Fund sub-wallet from treasury
  const handleFund = useCallback(async () => {
    if (!fundTarget || !fundAmount || !treasuryWallet) {
      setError('Missing fund target or amount');
      return;
    }

    const targetWallet = wallets.find(w => w.id === fundTarget);
    if (!targetWallet) {
      setError('Target wallet not found');
      return;
    }

    const amountSol = parseFloat(fundAmount);
    if (amountSol <= 0 || amountSol > (treasuryWallet.balance || 0)) {
      setError('Invalid amount or insufficient balance');
      return;
    }

    setIsFunding(true);
    setFundTxHash(null);
    setError(null);

    try {
      const keypairs = getKeypairs();
      const treasuryKeypair = keypairs.find(kp => kp.publicKey.toBase58() === treasuryWallet.address);
      
      if (!treasuryKeypair) {
        throw new Error('Treasury keypair not found. Is vault unlocked?');
      }

      const connection = new Connection(rpcUrl, 'confirmed');

      // Create transfer instruction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey: new PublicKey(targetWallet.address),
          lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = treasuryKeypair.publicKey;

      // Sign and send
      transaction.sign(treasuryKeypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());

      setFundTxHash(signature);
      setSuccess(`Funded ${amountSol} SOL to ${targetWallet.name}!`);
      
      // Refresh balances after a short delay
      setTimeout(() => {
        refreshBalances();
      }, 2000);

      // Close modal after success
      setTimeout(() => {
        setShowFundModal(false);
        setFundTarget(null);
        setFundAmount('0.01');
        setFundTxHash(null);
      }, 3000);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsFunding(false);
    }
  }, [fundTarget, fundAmount, treasuryWallet, wallets, getKeypairs, rpcUrl, refreshBalances]);

  // Bulk fund all sub-wallets from treasury
  const handleBulkFund = useCallback(async () => {
    if (!treasuryWallet || subWallets.length === 0) {
      setError('No treasury or sub-wallets available');
      return;
    }

    const treasuryBalance = treasuryWallet.balance || 0;
    // Leave some SOL in treasury for fees
    const availableToDistribute = treasuryBalance - RENT_RESERVE;
    
    if (availableToDistribute <= 0) {
      setError('Insufficient treasury balance');
      return;
    }

    const amountPerWallet = availableToDistribute / subWallets.length;
    
    if (amountPerWallet < 0.001) {
      setError('Amount per wallet too small');
      return;
    }

    setIsBulkFunding(true);
    setError(null);

    try {
      const keypairs = getKeypairs();
      const treasuryKeypair = keypairs.find(kp => kp.publicKey.toBase58() === treasuryWallet.address);
      
      if (!treasuryKeypair) {
        throw new Error('Treasury keypair not found. Is vault unlocked?');
      }

      const connection = new Connection(rpcUrl, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();

      // Create a transaction with transfers to all sub-wallets
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = treasuryKeypair.publicKey;

      for (const wallet of subWallets) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: treasuryKeypair.publicKey,
            toPubkey: new PublicKey(wallet.address),
            lamports: Math.floor(amountPerWallet * LAMPORTS_PER_SOL),
          })
        );
      }

      transaction.sign(treasuryKeypair);
      const signature = await connection.sendRawTransaction(transaction.serialize());
      
      await connection.confirmTransaction(signature, 'confirmed');

      setSuccess(`Funded ${subWallets.length} wallets with ${amountPerWallet.toFixed(4)} SOL each!`);
      
      setTimeout(() => refreshBalances(), 1000);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBulkFunding(false);
    }
  }, [treasuryWallet, subWallets, getKeypairs, rpcUrl, refreshBalances]);

  // Sweep all sub-wallets back to treasury
  const handleBulkSweep = useCallback(async () => {
    if (!treasuryWallet || subWallets.length === 0) {
      setError('No treasury or sub-wallets available');
      return;
    }

    // Filter wallets that have enough balance to sweep
    const sweepableWallets = subWallets.filter(w => (w.balance || 0) > RENT_RESERVE + 0.001);
    
    if (sweepableWallets.length === 0) {
      setError('No wallets have enough balance to sweep');
      return;
    }

    setIsSweeping(true);
    setError(null);

    try {
      const keypairs = getKeypairs();
      const connection = new Connection(rpcUrl, 'confirmed');
      
      let successCount = 0;
      let totalSwept = 0;

      // Process each wallet individually (each needs its own signer)
      for (const wallet of sweepableWallets) {
        const walletKeypair = keypairs.find(kp => kp.publicKey.toBase58() === wallet.address);
        
        if (!walletKeypair) {
          console.warn(`Keypair not found for ${wallet.name}`);
          continue;
        }

        const sweepAmount = (wallet.balance || 0) - RENT_RESERVE;
        if (sweepAmount <= 0) continue;

        try {
          const { blockhash } = await connection.getLatestBlockhash();
          
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: walletKeypair.publicKey,
              toPubkey: new PublicKey(treasuryWallet.address),
              lamports: Math.floor(sweepAmount * LAMPORTS_PER_SOL),
            })
          );
          
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = walletKeypair.publicKey;
          transaction.sign(walletKeypair);
          
          const signature = await connection.sendRawTransaction(transaction.serialize());
          await connection.confirmTransaction(signature, 'confirmed');
          
          successCount++;
          totalSwept += sweepAmount;
        } catch (walletErr) {
          console.error(`Failed to sweep ${wallet.name}:`, walletErr);
        }
      }

      if (successCount > 0) {
        setSuccess(`Swept ${totalSwept.toFixed(4)} SOL from ${successCount} wallets to Treasury!`);
        setTimeout(() => refreshBalances(), 1000);
      } else {
        setError('Failed to sweep any wallets');
      }

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSweeping(false);
    }
  }, [treasuryWallet, subWallets, getKeypairs, rpcUrl, refreshBalances]);

  // Sweep single wallet to treasury
  const handleSingleSweep = useCallback(async (walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet || !treasuryWallet) {
      setError('Wallet not found');
      return;
    }

    const sweepAmount = (wallet.balance || 0) - RENT_RESERVE;
    if (sweepAmount <= 0) {
      setError('Insufficient balance to sweep (need to leave rent reserve)');
      return;
    }

    setSweepingWalletId(walletId);
    setError(null);

    try {
      const keypairs = getKeypairs();
      const walletKeypair = keypairs.find(kp => kp.publicKey.toBase58() === wallet.address);
      
      if (!walletKeypair) {
        throw new Error('Wallet keypair not found. Is vault unlocked?');
      }

      const connection = new Connection(rpcUrl, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: walletKeypair.publicKey,
          toPubkey: new PublicKey(treasuryWallet.address),
          lamports: Math.floor(sweepAmount * LAMPORTS_PER_SOL),
        })
      );
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletKeypair.publicKey;
      transaction.sign(walletKeypair);
      
      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      setSuccess(`Swept ${sweepAmount.toFixed(4)} SOL from ${wallet.name} to Treasury!`);
      setTimeout(() => refreshBalances(), 1000);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSweepingWalletId(null);
    }
  }, [wallets, treasuryWallet, getKeypairs, rpcUrl, refreshBalances]);

  // Render locked state
  if (!hasVault) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Wallet Vault</h2>
          <p className="text-slate-400">Create your encrypted wallet vault to get started</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-900/30 to-slate-900 rounded-xl p-8 border border-purple-500/30">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center mx-auto">
              <Shield className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold">Create Secure Vault</h3>
            <p className="text-slate-400 max-w-md mx-auto">
              Your wallets are encrypted locally with AES-256. Only you have the password.
            </p>
            <button
              onClick={() => setShowCreateVaultModal(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium"
            >
              Create Vault
            </button>
          </div>
        </div>

        {/* Create Vault Modal */}
        {showCreateVaultModal && (
          <Modal onClose={() => setShowCreateVaultModal(false)}>
            <h3 className="text-lg font-bold mb-4">Create Wallet Vault</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Password (min 8 chars)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                  placeholder="Enter vault password"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                  placeholder="Confirm password"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateVaultModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateVault}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg"
                >
                  Create
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Wallet Vault</h2>
          <p className="text-slate-400">Unlock your vault to access wallets</p>
        </div>
        
        <div className="bg-slate-900 rounded-xl p-8 border border-slate-800">
          <div className="text-center space-y-4 max-w-sm mx-auto">
            <Lock className="w-12 h-12 text-slate-500 mx-auto" />
            <h3 className="text-lg font-medium">Vault Locked</h3>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-center"
              placeholder="Enter password"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleUnlock}
              disabled={isLoading}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Unlock Vault'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unlocked - show treasury + sub-wallets
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Wallet Vault</h2>
          <p className="text-slate-400">{network === 'mainnet' ? '🔴 Mainnet' : '🟢 Devnet'} • {wallets.length} wallets</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshBalances}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
            title="Refresh balances"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={lock}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg"
          >
            <Lock className="w-4 h-4" />
            Lock
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(error || walletError) && (
        <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || walletError}</span>
          <button onClick={() => { setError(null); clearError(); }} className="ml-auto">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400">
          <CheckCircle className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {/* Treasury Card */}
      {treasuryWallet && (
        <div className="bg-gradient-to-br from-yellow-900/30 to-slate-900 rounded-xl p-6 border border-yellow-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <Crown className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {treasuryWallet.name}
                <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">TREASURY</span>
              </h3>
              <p className="text-slate-400 text-sm">Main funding wallet</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">Balance</p>
              <p className="text-2xl font-bold text-white">{treasuryWallet.balance.toFixed(4)} SOL</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-400 text-sm mb-1">Address</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-slate-300 truncate">
                  {treasuryWallet.address.slice(0, 8)}...{treasuryWallet.address.slice(-8)}
                </code>
                <button
                  onClick={() => copyToClipboard(treasuryWallet.address, 'Address')}
                  className="text-slate-400 hover:text-white"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => openHistory(treasuryWallet.address)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm"
            >
              <History className="w-4 h-4" />
              History
            </button>
            <a
              href={`https://solscan.io/account/${treasuryWallet.address}${network === 'devnet' ? '?cluster=devnet' : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
            >
              Solscan <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Bulk Operations */}
          {subWallets.length > 0 && (
            <div className="mt-4 pt-4 border-t border-yellow-500/20">
              <p className="text-xs text-slate-400 mb-3">Bulk Operations ({subWallets.length} sub-wallets)</p>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkFund}
                  disabled={isBulkFunding || isSweeping || treasuryWallet.balance <= RENT_RESERVE}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium"
                >
                  {isBulkFunding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Funding...
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-4 h-4" />
                      Fund Sub-Wallets
                    </>
                  )}
                </button>
                <button
                  onClick={handleBulkSweep}
                  disabled={isSweeping || isBulkFunding}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium"
                >
                  {isSweeping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sweeping...
                    </>
                  ) : (
                    <>
                      <ArrowUp className="w-4 h-4" />
                      Sweep to Treasury
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Fund: distributes {((treasuryWallet.balance - RENT_RESERVE) / subWallets.length).toFixed(4)} SOL each • 
                Sweep: leaves {RENT_RESERVE} SOL rent reserve
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sub-Wallets Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Sub-Wallets</h3>
          <button
            onClick={() => setShowAddWalletModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Wallet
          </button>
        </div>

        {subWallets.length === 0 ? (
          <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 text-center">
            <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No sub-wallets yet</p>
            <p className="text-slate-500 text-sm">Add sniper wallets to start trading</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {subWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="bg-slate-900 rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      wallet.type === 'sniper' ? 'bg-emerald-400' : 'bg-blue-400'
                    }`} />
                    <span className="font-medium">{wallet.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-800 rounded">{wallet.type}</span>
                  </div>
                  <button
                    onClick={() => removeWallet(wallet.id, password)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-sm">Balance</span>
                    <span className="font-mono">{wallet.balance.toFixed(4)} SOL</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-slate-400 truncate flex-1">
                      {wallet.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(wallet.address, 'Address')}
                      className="text-slate-500 hover:text-white"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setFundTarget(wallet.id); setShowFundModal(true); }}
                    disabled={isBulkFunding || isSweeping}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 disabled:opacity-50 rounded text-sm"
                  >
                    <ArrowDown className="w-3 h-3" />
                    Fund
                  </button>
                  <button
                    onClick={() => handleSingleSweep(wallet.id)}
                    disabled={sweepingWalletId === wallet.id || isBulkFunding || isSweeping || wallet.balance <= RENT_RESERVE}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 disabled:opacity-50 rounded text-sm"
                  >
                    {sweepingWalletId === wallet.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowUp className="w-3 h-3" />
                    )}
                    Sweep
                  </button>
                  <button
                    onClick={() => openHistory(wallet.address)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded text-sm"
                    title="View transaction history"
                  >
                    <History className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Wallet Modal */}
      {showAddWalletModal && (
        <Modal onClose={() => setShowAddWalletModal(false)}>
          <h3 className="text-lg font-bold mb-4">Add Sub-Wallet</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Wallet Name</label>
              <input
                type="text"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                placeholder="e.g., Sniper 1"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Import Key (optional)</label>
              <textarea
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg h-20 font-mono text-xs"
                placeholder="[240,5,159,...] or leave empty to generate new"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Vault Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                placeholder="Enter vault password"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAddWalletModal(false); setNewWalletName(''); setImportKey(''); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubWallet}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Add Wallet'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Fund Modal */}
      {showFundModal && fundTarget && (
        <Modal onClose={() => { setShowFundModal(false); setFundTxHash(null); }}>
          <h3 className="text-lg font-bold mb-4">Fund from Treasury</h3>
          <div className="space-y-4">
            <div className="p-3 bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-400">From: Treasury</p>
              <p className="font-mono text-sm">{treasuryWallet?.balance.toFixed(4)} SOL available</p>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-slate-400">To:</p>
              <p className="font-medium text-white">{wallets.find(w => w.id === fundTarget)?.name}</p>
              <p className="font-mono text-xs text-slate-500">{wallets.find(w => w.id === fundTarget)?.address.slice(0, 20)}...</p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Amount (SOL)</label>
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                step="0.01"
                min="0"
                max={treasuryWallet?.balance || 0}
              />
            </div>
            
            {fundTxHash && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm text-emerald-400">Transfer sent!</p>
                </div>
                <a
                  href={`https://solscan.io/tx/${fundTxHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline"
                >
                  View on Solscan →
                </a>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={() => { setShowFundModal(false); setFundTxHash(null); setError(null); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                {fundTxHash ? 'Close' : 'Cancel'}
              </button>
              {!fundTxHash && (
                <button
                  onClick={handleFund}
                  disabled={isFunding || !fundAmount || parseFloat(fundAmount) <= 0}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg flex items-center justify-center gap-2"
                >
                  {isFunding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-4 h-4" />
                      Send {fundAmount} SOL
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Transaction History Modal */}
      {showHistoryModal && historyWallet && (
        <Modal onClose={() => { setShowHistoryModal(false); setHistoryWallet(null); }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              Transaction History
            </h3>
            <button
              onClick={() => fetchTransactionHistory(historyWallet, true)}
              disabled={historyLoading}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="text-xs text-slate-500 mb-3 font-mono truncate">
            {historyWallet.slice(0, 16)}...{historyWallet.slice(-8)}
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                <span className="ml-2 text-slate-400">Loading transactions...</span>
              </div>
            ) : historyTransactions.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">No transactions found</p>
                <p className="text-slate-500 text-xs">This wallet has no recent activity</p>
              </div>
            ) : (
              historyTransactions.map((tx) => (
                <div
                  key={tx.signature}
                  className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {tx.type === 'receive' ? (
                        <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                          <ArrowDown className="w-3 h-3 text-emerald-400" />
                        </div>
                      ) : tx.type === 'send' ? (
                        <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center">
                          <ArrowUp className="w-3 h-3 text-red-400" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-slate-500/20 rounded-full flex items-center justify-center">
                          <Zap className="w-3 h-3 text-slate-400" />
                        </div>
                      )}
                      <span className={`text-sm font-medium ${
                        tx.type === 'receive' ? 'text-emerald-400' :
                        tx.type === 'send' ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {tx.type === 'receive' ? '+' : tx.type === 'send' ? '-' : ''}
                        {tx.amount.toFixed(6)} SOL
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {tx.timestamp
                        ? new Date(tx.timestamp * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Unknown'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-slate-500">
                      {tx.counterparty ? (
                        <span className="font-mono">
                          {tx.type === 'receive' ? 'From: ' : 'To: '}
                          {tx.counterparty.slice(0, 6)}...{tx.counterparty.slice(-4)}
                        </span>
                      ) : (
                        <span className="text-slate-600">Contract interaction</span>
                      )}
                    </div>
                    <a
                      href={`https://solscan.io/tx/${tx.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={() => { setShowHistoryModal(false); setHistoryWallet(null); }}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Simple Modal component
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 rounded-xl p-6 w-full max-w-md border border-slate-800 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default TreasuryWalletManager;
