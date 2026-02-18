/**
 * TreasuryWalletManager - DEX-style wallet management
 * Treasury wallet at top with linked sub-wallets below
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
  Coins,
  Key,
  Eye,
  EyeOff,
  Pencil,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { useTxHistory } from '@/context/TxHistoryContext';
import { getQuote as dexGetQuote, executeSwap as dexExecuteSwap, type DexConfig } from '@/lib/dex';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, ParsedTransactionWithMeta, VersionedTransaction } from '@solana/web3.js';

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

interface WalletTokenHolding {
  mint: string;
  amountRaw: string;
  amountUi: number;
  decimals: number;
}

interface WalletHoldingsByWallet {
  [walletId: string]: WalletTokenHolding[];
}

interface WalletHoldingsLoadingByWallet {
  [walletId: string]: boolean;
}

interface ExpandedWalletsState {
  [walletId: string]: boolean;
}

interface PendingSellState {
  walletId: string;
  walletName: string;
  walletAddress: string;
  mint: string;
  amountRaw: string;
  amountUi: number;
  decimals: number;
}

interface PendingPrivateKeyExportState {
  walletId: string;
  walletName: string;
  walletAddress: string;
  secretKeyJson: string;
}

const CACHE_TTL = 60000; // 1 minute cache
const RENT_RESERVE = 0.005; // SOL to leave for rent exemption
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';

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
    generateWallets,
    importWallet,
    removeWallet,
    updateWallet,
    refreshBalances,
    clearError,
    getKeypairs,
  } = useSecureWallet({ rpcUrl });
  const { addTrade } = useTxHistory();

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
  const [newWalletCount, setNewWalletCount] = useState(1);
  const newWalletType = 'sniper' as const;
  const [importKey, setImportKey] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editWalletId, setEditWalletId] = useState('');
  const [editName, setEditName] = useState('');
  const editType = 'sniper' as const;
  const [isFunding, setIsFunding] = useState(false);
  const [fundTxHash, setFundTxHash] = useState<string | null>(null);
  
  // Transaction history state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyWallet, setHistoryWallet] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTransactions, setHistoryTransactions] = useState<TransactionInfo[]>([]);
  const txHistoryCache = useRef<TxHistoryCache>({});
  const [isBulkFunding, setIsBulkFunding] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepingWalletId, setSweepingWalletId] = useState<string | null>(null);
  const [walletHoldings, setWalletHoldings] = useState<WalletHoldingsByWallet>({});
  const [walletHoldingsLoading, setWalletHoldingsLoading] = useState<WalletHoldingsLoadingByWallet>({});
  const [expandedWallets, setExpandedWallets] = useState<ExpandedWalletsState>({});
  const [pendingSell, setPendingSell] = useState<PendingSellState | null>(null);
  const [isSelling, setIsSelling] = useState(false);
  const [sellLoadingByRow, setSellLoadingByRow] = useState<Record<string, boolean>>({});
  const [sellTxHash, setSellTxHash] = useState<string | null>(null);
  const [pendingPrivateKeyExport, setPendingPrivateKeyExport] = useState<PendingPrivateKeyExportState | null>(null);
  const [isPrivateKeyVisible, setIsPrivateKeyVisible] = useState(false);
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
  const [isSellingAll, setIsSellingAll] = useState(false);
  const [sellAllProgress, setSellAllProgress] = useState('');

  const walletAddressKey = wallets.map(w => w.address).join('|');

  // Main wallet is always the first one
  const treasuryWallet = wallets[0];
  const subWallets = wallets.filter(w => w.id !== treasuryWallet?.id);

  const showSuccess = useCallback((message: string, txHash?: string) => {
    setSuccess(message);
    setSellTxHash(txHash ?? null);
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setSuccess(null);
    setSellTxHash(null);
  }, []);

  const getWalletSigner = useCallback((walletAddress: string) => {
    const keypairs = getKeypairs();
    return keypairs.find(kp => kp.publicKey.toBase58() === walletAddress);
  }, [getKeypairs]);

  const fetchWalletHoldings = useCallback(async (wallet: (typeof wallets)[number]) => {
    setWalletHoldingsLoading(prev => ({ ...prev, [wallet.id]: true }));

    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(wallet.address),
        { programId: SPL_TOKEN_PROGRAM_ID }
      );

      const holdings = tokenAccounts.value
        .map((account) => {
          const info = account.account.data.parsed.info;
          const tokenAmount = info.tokenAmount;
          const amountRaw = tokenAmount.amount as string;
          const amountUi = tokenAmount.uiAmount ?? parseFloat(tokenAmount.uiAmountString || '0');
          const decimals = tokenAmount.decimals as number;

          return {
            mint: info.mint as string,
            amountRaw,
            amountUi: Number.isFinite(amountUi) ? amountUi : 0,
            decimals,
          } as WalletTokenHolding;
        })
        .filter(h => {
          try {
            return BigInt(h.amountRaw) > 0n;
          } catch {
            return h.amountUi > 0;
          }
        })
        .sort((a, b) => b.amountUi - a.amountUi);

      setWalletHoldings(prev => ({ ...prev, [wallet.id]: holdings }));
    } catch (err) {
      console.error(`Failed to fetch token holdings for ${wallet.name}:`, err);
      setWalletHoldings(prev => ({ ...prev, [wallet.id]: [] }));
    } finally {
      setWalletHoldingsLoading(prev => ({ ...prev, [wallet.id]: false }));
    }
  }, [rpcUrl]);

  const refreshAllWalletHoldings = useCallback(async () => {
    if (isLocked || wallets.length === 0) {
      setWalletHoldings({});
      setWalletHoldingsLoading({});
      return;
    }

    await Promise.all(wallets.map(wallet => fetchWalletHoldings(wallet)));
  }, [isLocked, wallets, fetchWalletHoldings]);

  const formatTokenAmount = useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return '0';
    if (amount >= 1_000_000) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, []);

  const toggleWalletExpanded = useCallback((walletId: string) => {
    setExpandedWallets(prev => ({ ...prev, [walletId]: !prev[walletId] }));
  }, []);

  const handleRefreshAll = useCallback(async () => {
    clearFeedback();
    await Promise.all([refreshBalances(), refreshAllWalletHoldings()]);
  }, [clearFeedback, refreshBalances, refreshAllWalletHoldings]);

  const handleOpenSellConfirm = useCallback((
    wallet: (typeof wallets)[number],
    token: WalletTokenHolding
  ) => {
    const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
    if (!jupiterApiKey) {
      setError('Jupiter API key missing. Set it in Settings to enable token sells.');
      return;
    }

    clearFeedback();
    setPendingSell({
      walletId: wallet.id,
      walletName: wallet.name,
      walletAddress: wallet.address,
      mint: token.mint,
      amountRaw: token.amountRaw,
      amountUi: token.amountUi,
      decimals: token.decimals,
    });
  }, [clearFeedback]);

  const handleOpenPrivateKeyExport = useCallback((wallet: (typeof wallets)[number]) => {
    clearFeedback();
    const signer = getWalletSigner(wallet.address);
    if (!signer) {
      setError('Wallet signer not found. Unlock your vault and retry.');
      return;
    }

    setPendingPrivateKeyExport({
      walletId: wallet.id,
      walletName: wallet.name,
      walletAddress: wallet.address,
      secretKeyJson: JSON.stringify(Array.from(signer.secretKey)),
    });
    setIsPrivateKeyVisible(false);
  }, [clearFeedback, getWalletSigner]);

  const handleConfirmSell = useCallback(async () => {
    if (!pendingSell) return;

    const rowKey = `${pendingSell.walletId}:${pendingSell.mint}`;
    const signer = getWalletSigner(pendingSell.walletAddress);
    if (!signer) {
      setError('Wallet signer not found. Unlock your vault and retry.');
      setPendingSell(null);
      return;
    }

    const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
    if (!jupiterApiKey) {
      setError('Jupiter API key missing. Set it in Settings to enable token sells.');
      setPendingSell(null);
      return;
    }

    setIsSelling(true);
    setSellLoadingByRow(prev => ({ ...prev, [rowKey]: true }));
    clearFeedback();

    try {
      const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
        inputMint: pendingSell.mint,
        outputMint: WSOL_MINT,
        amount: pendingSell.amountRaw,
        slippageBps: '200',
      });

      const quoteResponse = await fetch(quoteUrl, {
        headers: { 'x-api-key': jupiterApiKey },
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        throw new Error(`Jupiter quote failed (${quoteResponse.status}): ${errorText}`);
      }

      const quote = await quoteResponse.json();

      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': jupiterApiKey,
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: signer.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        throw new Error(`Jupiter swap failed (${swapResponse.status}): ${errorText}`);
      }

      const swapPayload = await swapResponse.json();
      const transactionBuffer = Buffer.from(swapPayload.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      transaction.sign([signer]);

      const connection = new Connection(rpcUrl, 'confirmed');
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(signature, 'confirmed');

      showSuccess(`Sell Max successful for ${pendingSell.walletName}`, signature);
      setPendingSell(null);

      await Promise.all([refreshAllWalletHoldings(), refreshBalances()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown sell error';
      setError(`${message}. If balance changed, refresh and retry.`);
      await refreshAllWalletHoldings();
    } finally {
      setIsSelling(false);
      setSellLoadingByRow(prev => ({ ...prev, [rowKey]: false }));
    }
  }, [
    pendingSell,
    getWalletSigner,
    clearFeedback,
    rpcUrl,
    refreshAllWalletHoldings,
    refreshBalances,
    showSuccess,
  ]);

  // Sell all tokens from selected wallets back to SOL
  const handleSellAllTokens = useCallback(async () => {
    const targetIds = selectedWalletIds.length > 0 ? selectedWalletIds : subWallets.map(w => w.id);
    const targetWallets = wallets.filter(w => targetIds.includes(w.id));
    if (targetWallets.length === 0) return;

    const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';

    setIsSellingAll(true);
    clearFeedback();

    let totalSold = 0;
    let totalFailed = 0;
    const connection = new Connection(rpcUrl, 'confirmed');

    for (const wallet of targetWallets) {
      const signer = getWalletSigner(wallet.address);
      if (!signer) {
        totalFailed++;
        continue;
      }

      // Fetch current holdings for this wallet
      setSellAllProgress(`Scanning ${wallet.name || wallet.address.slice(0, 6)}...`);
      let holdings: WalletTokenHolding[] = [];
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(wallet.address),
          { programId: SPL_TOKEN_PROGRAM_ID }
        );
        holdings = tokenAccounts.value
          .map((account) => {
            const info = account.account.data.parsed.info;
            const tokenAmount = info.tokenAmount;
            return {
              mint: info.mint as string,
              amountRaw: tokenAmount.amount as string,
              amountUi: tokenAmount.uiAmount ?? parseFloat(tokenAmount.uiAmountString || '0'),
              decimals: tokenAmount.decimals as number,
            };
          })
          .filter(h => BigInt(h.amountRaw) > 0n && h.mint !== WSOL_MINT);
      } catch {
        totalFailed++;
        continue;
      }

      if (holdings.length === 0) continue;

      // Sell each token — try Jupiter first, fall back to PumpFun for pre-graduation tokens
      for (const token of holdings) {
        setSellAllProgress(`Selling ${token.mint.slice(0, 6)}... from ${wallet.name || wallet.address.slice(0, 6)}`);
        try {
          // Try Jupiter first (works for graduated tokens)
          const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
            inputMint: token.mint,
            outputMint: WSOL_MINT,
            amount: token.amountRaw,
            slippageBps: '200',
          });

          const quoteResponse = await fetch(quoteUrl, {
            headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {},
          });
          if (!quoteResponse.ok) throw new Error('Jupiter quote failed');

          const quote = await quoteResponse.json();

          const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}),
            },
            body: JSON.stringify({
              quoteResponse: quote,
              userPublicKey: signer.publicKey.toBase58(),
              wrapAndUnwrapSol: true,
              dynamicComputeUnitLimit: true,
              prioritizationFeeLamports: 'auto',
            }),
          });
          if (!swapResponse.ok) throw new Error('Jupiter swap failed');

          const swapPayload = await swapResponse.json();
          const transactionBuffer = Buffer.from(swapPayload.swapTransaction, 'base64');
          const transaction = VersionedTransaction.deserialize(transactionBuffer);
          transaction.sign([signer]);

          const signature = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            maxRetries: 3,
          });
          await connection.confirmTransaction(signature, 'confirmed');

          totalSold++;
          // Record sell so PnL position card clears
          addTrade({
            timestamp: Date.now(),
            type: 'sell',
            tokenMint: token.mint,
            amount: token.amountUi,
            wallet: wallet.address,
            txHash: signature,
            status: 'success',
            source: 'treasury',
          });
        } catch (jupiterErr) {
          // Jupiter failed — try PumpFun for pre-graduation tokens
          try {
            setSellAllProgress(`Selling ${token.mint.slice(0, 6)}... via PumpFun from ${wallet.name || wallet.address.slice(0, 6)}`);
            const pfConfig: DexConfig = { rpcUrl, slippageBps: 200 };
            const pfQuote = await dexGetQuote('pumpfun', token.mint, WSOL_MINT, parseInt(token.amountRaw), pfConfig);
            const pfResult = await dexExecuteSwap(pfQuote, signer, pfConfig);
            if (pfResult.success) {
              totalSold++;
              // Record sell so PnL position card clears
              addTrade({
                timestamp: Date.now(),
                type: 'sell',
                tokenMint: token.mint,
                amount: token.amountUi,
                wallet: wallet.address,
                txHash: pfResult.txHash,
                status: 'success',
                source: 'treasury',
              });
            } else {
              throw new Error(pfResult.error || 'PumpFun sell failed');
            }
          } catch (pfErr) {
            console.error(`Sell failed for ${token.mint} in ${wallet.address}:`, jupiterErr, pfErr);
            totalFailed++;
          }
        }
      }
    }

    setSellAllProgress('');
    showSuccess(`Sold ${totalSold} token${totalSold !== 1 ? 's' : ''} to SOL${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`);
    setIsSellingAll(false);
    await Promise.all([refreshAllWalletHoldings(), refreshBalances()]);
  }, [selectedWalletIds, subWallets, wallets, rpcUrl, getWalletSigner, clearFeedback, showSuccess, refreshAllWalletHoldings, refreshBalances, addTrade]);

  const renderWalletTokenSection = useCallback((wallet: (typeof wallets)[number]) => {
    const tokens = walletHoldings[wallet.id] || [];
    const isExpanded = !!expandedWallets[wallet.id];
    const isLoadingTokens = !!walletHoldingsLoading[wallet.id];

    return (
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => toggleWalletExpanded(wallet.id)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Tokens: {tokens.length}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </button>
          <button
            onClick={() => fetchWalletHoldings(wallet)}
            disabled={isLoadingTokens || isSelling}
            className="p-1.5 text-slate-500 hover:text-white disabled:opacity-50"
            title="Refresh token holdings"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTokens ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-2">
            {isLoadingTokens ? (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading token holdings...
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-xs text-slate-500">No SPL tokens</div>
            ) : (
              tokens.map((token) => {
                const rowKey = `${wallet.id}:${token.mint}`;
                const isRowSelling = !!sellLoadingByRow[rowKey];
                return (
                  <div
                    key={rowKey}
                    className="p-2 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <div className="text-xs font-mono text-slate-300 truncate">
                          {token.mint.slice(0, 6)}...{token.mint.slice(-6)}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(token.mint);
                            showSuccess('Token mint copied!');
                            setTimeout(() => {
                              setSuccess(null);
                              setSellTxHash(null);
                            }, 2000);
                          }}
                          className="text-slate-500 hover:text-white"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {formatTokenAmount(token.amountUi)}
                        </span>
                        <a
                          href={`https://solscan.io/token/${token.mint}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenSellConfirm(wallet, token)}
                      disabled={isRowSelling || isSelling}
                      className="px-2.5 py-1.5 rounded text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 disabled:opacity-50 flex items-center gap-1"
                    >
                      {isRowSelling ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Selling...
                        </>
                      ) : (
                        'Sell Max'
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }, [
    walletHoldings,
    expandedWallets,
    walletHoldingsLoading,
    toggleWalletExpanded,
    fetchWalletHoldings,
    isSelling,
    sellLoadingByRow,
    formatTokenAmount,
    network,
    handleOpenSellConfirm,
    showSuccess,
  ]);

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
    showSuccess(`${label} copied!`);
    setTimeout(() => {
      setSuccess(null);
      setSellTxHash(null);
    }, 2000);
  }, [showSuccess]);

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
      showSuccess('Vault created with Treasury wallet!');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [password, confirmPassword, generateWallet, showSuccess]);

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
    // Enforce 100 wallet max
    const remaining = 100 - wallets.length;
    if (remaining <= 0) {
      setError('Maximum 100 wallets reached. Delete some wallets first.');
      return;
    }
    const count = Math.min(newWalletCount, remaining);
    try {
      if (importKey) {
        // Import always adds a single wallet
        const keyArray = JSON.parse(importKey);
        await importWallet(new Uint8Array(keyArray), newWalletName, newWalletType, password);
        showSuccess('Sub-wallet imported!');
      } else if (count === 1) {
        await generateWallet(newWalletName, newWalletType, password);
        showSuccess('Sub-wallet added!');
      } else {
        // Bulk generate with suffix: "Name-1", "Name-2", etc.
        await generateWallets(count, `${newWalletName}-`, newWalletType, password);
        showSuccess(`Generated ${count} wallets!`);
      }
      setShowAddWalletModal(false);
      setNewWalletName('');
      setNewWalletCount(1);
      setImportKey('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [newWalletName, newWalletCount, newWalletType, importKey, password, wallets.length, generateWallet, generateWallets, importWallet, showSuccess]);

  // Edit wallet
  const handleEditWallet = useCallback((walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) return;
    setEditWalletId(walletId);
    setEditName(wallet.name || '');
    setShowEditModal(true);
  }, [wallets]);

  const handleSaveEdit = useCallback(async () => {
    if (!password) {
      const pwd = prompt('Enter vault password:');
      if (!pwd) return;
      try {
        await updateWallet(editWalletId, { name: editName, type: editType }, pwd);
        showSuccess('Wallet updated!');
        setShowEditModal(false);
        setEditWalletId('');
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    try {
      await updateWallet(editWalletId, { name: editName, type: editType }, password);
      showSuccess('Wallet updated!');
      setShowEditModal(false);
      setEditWalletId('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [editWalletId, editName, editType, password, updateWallet, showSuccess]);

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
      showSuccess(`Funded ${amountSol} SOL to ${targetWallet.name}!`);
      
      // Refresh balances after a short delay
      setTimeout(() => {
        Promise.all([refreshBalances(), refreshAllWalletHoldings()]);
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
  }, [fundTarget, fundAmount, treasuryWallet, wallets, getKeypairs, rpcUrl, refreshBalances, refreshAllWalletHoldings, showSuccess]);

  // Bulk fund selected (or all) sub-wallets from treasury
  const handleBulkFund = useCallback(async () => {
    const targetWallets = selectedWalletIds.length > 0
      ? subWallets.filter(w => selectedWalletIds.includes(w.id))
      : subWallets;

    if (!treasuryWallet || targetWallets.length === 0) {
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

    const amountPerWallet = availableToDistribute / targetWallets.length;

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

      // Create a transaction with transfers to selected sub-wallets
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = treasuryKeypair.publicKey;

      for (const wallet of targetWallets) {
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

      showSuccess(`Funded ${targetWallets.length} wallets with ${amountPerWallet.toFixed(4)} SOL each!`);

      setTimeout(() => {
        Promise.all([refreshBalances(), refreshAllWalletHoldings()]);
      }, 1000);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsBulkFunding(false);
    }
  }, [treasuryWallet, subWallets, selectedWalletIds, getKeypairs, rpcUrl, refreshBalances, refreshAllWalletHoldings, showSuccess]);

  // Sweep selected (or all) sub-wallets back to treasury
  const handleBulkSweep = useCallback(async () => {
    const targetWallets = selectedWalletIds.length > 0
      ? subWallets.filter(w => selectedWalletIds.includes(w.id))
      : subWallets;

    if (!treasuryWallet || targetWallets.length === 0) {
      setError('No treasury or sub-wallets available');
      return;
    }

    // Filter wallets that have enough balance to sweep
    const sweepableWallets = targetWallets.filter(w => (w.balance || 0) > RENT_RESERVE + 0.001);

    if (sweepableWallets.length === 0) {
      setError('No selected wallets have enough balance to sweep');
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
        showSuccess(`Swept ${totalSwept.toFixed(4)} SOL from ${successCount} wallets to Treasury!`);
        setTimeout(() => {
          Promise.all([refreshBalances(), refreshAllWalletHoldings()]);
        }, 1000);
      } else {
        setError('Failed to sweep any wallets');
      }

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSweeping(false);
    }
  }, [treasuryWallet, subWallets, selectedWalletIds, getKeypairs, rpcUrl, refreshBalances, refreshAllWalletHoldings, showSuccess]);

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

      showSuccess(`Swept ${sweepAmount.toFixed(4)} SOL from ${wallet.name} to Treasury!`);
      setTimeout(() => {
        Promise.all([refreshBalances(), refreshAllWalletHoldings()]);
      }, 1000);

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSweepingWalletId(null);
    }
  }, [wallets, treasuryWallet, getKeypairs, rpcUrl, refreshBalances, refreshAllWalletHoldings, showSuccess]);

  // Delete wallet — sweep remaining SOL to treasury first, then remove from vault
  const handleDeleteWallet = useCallback(async (walletId: string) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) {
      setError('Wallet not found');
      return;
    }

    setError(null);

    try {
      // If this wallet has any balance and treasury exists, sweep first
      const balance = wallet.balance || 0;
      if (balance > 0.000005 && treasuryWallet && wallet.id !== treasuryWallet.id) {
        const keypairs = getKeypairs();
        const walletKeypair = keypairs.find(kp => kp.publicKey.toBase58() === wallet.address);

        if (walletKeypair) {
          const connection = new Connection(rpcUrl, 'confirmed');
          // Get fresh balance from chain (UI balance may be stale)
          const lamports = await connection.getBalance(walletKeypair.publicKey);
          // Reserve 5000 lamports for the transfer fee
          const sweepLamports = lamports - 5000;

          if (sweepLamports > 0) {
            const { blockhash } = await connection.getLatestBlockhash();
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: walletKeypair.publicKey,
                toPubkey: new PublicKey(treasuryWallet.address),
                lamports: sweepLamports,
              })
            );
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = walletKeypair.publicKey;
            transaction.sign(walletKeypair);

            const signature = await connection.sendRawTransaction(transaction.serialize());
            await connection.confirmTransaction(signature, 'confirmed');
          }
        }
      }

      // Now remove the wallet from the vault
      await removeWallet(walletId, password);
      showSuccess(`Deleted ${wallet.name}${balance > 0.000005 ? ` (swept ${balance.toFixed(4)} SOL to Treasury)` : ''}`);
      refreshBalances();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [wallets, treasuryWallet, getKeypairs, rpcUrl, password, removeWallet, refreshBalances, showSuccess]);

  useEffect(() => {
    if (isLocked) {
      setWalletHoldings({});
      setWalletHoldingsLoading({});
      setExpandedWallets({});
      setPendingSell(null);
      setSellLoadingByRow({});
      setSellTxHash(null);
      setPendingPrivateKeyExport(null);
      setIsPrivateKeyVisible(false);
      return;
    }

    if (wallets.length === 0) {
      setWalletHoldings({});
      setWalletHoldingsLoading({});
      return;
    }

    refreshAllWalletHoldings();
  }, [isLocked, walletAddressKey, wallets.length, refreshAllWalletHoldings]);

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
            onClick={handleRefreshAll}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
            title="Refresh balances and holdings"
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
          <div className="flex-1">
            <span>{error || walletError}</span>
            {error?.includes('Jupiter API key missing') && (
              <div className="mt-2">
                <button
                  onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                  className="text-xs px-3 py-1 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 rounded"
                >
                  Go to Settings to set Jupiter API key
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setError(null); clearError(); setSellTxHash(null); }} className="ml-auto">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400">
          <CheckCircle className="w-5 h-5" />
          <div className="flex-1">
            <span>{success}</span>
            {sellTxHash && (
              <a
                href={`https://solscan.io/tx/${sellTxHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-blue-300 hover:underline mt-1"
              >
                View sell transaction on Solscan
              </a>
            )}
          </div>
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
              <button
                onClick={() => handleOpenPrivateKeyExport(treasuryWallet)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg text-sm"
              >
                <Key className="w-4 h-4" />
                Export Key
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

          {renderWalletTokenSection(treasuryWallet)}

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
                <button
                  onClick={handleSellAllTokens}
                  disabled={isSellingAll || isBulkFunding || isSweeping}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-sm font-medium"
                >
                  {isSellingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Selling...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Sell All Tokens
                    </>
                  )}
                </button>
              </div>
              {isSellingAll && sellAllProgress && (
                <p className="text-xs text-amber-400 mt-2">{sellAllProgress}</p>
              )}
              <p className="text-xs text-slate-500 mt-2">
                {selectedWalletIds.length > 0
                  ? `Targeting ${selectedWalletIds.length} selected wallet${selectedWalletIds.length === 1 ? '' : 's'} • Fund: ${((treasuryWallet.balance - RENT_RESERVE) / selectedWalletIds.length).toFixed(4)} SOL each`
                  : `Targeting all ${subWallets.length} sub-wallets • Fund: ${((treasuryWallet.balance - RENT_RESERVE) / subWallets.length).toFixed(4)} SOL each`}
                {' • '}Sweep: leaves {RENT_RESERVE} SOL rent reserve
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sub-Wallets Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-white">Sub-Wallets</h3>
            {subWallets.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedWalletIds.length === subWallets.length && subWallets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedWalletIds(subWallets.map(w => w.id));
                    } else {
                      setSelectedWalletIds([]);
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-700"
                />
                <span className="text-sm text-slate-400">
                  Select All{selectedWalletIds.length > 0 ? ` (${selectedWalletIds.length})` : ''}
                </span>
              </label>
            )}
          </div>
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
                className={`bg-slate-900 rounded-xl p-4 border transition-colors ${
                  selectedWalletIds.includes(wallet.id)
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedWalletIds.includes(wallet.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWalletIds(prev => [...prev, wallet.id]);
                        } else {
                          setSelectedWalletIds(prev => prev.filter(id => id !== wallet.id));
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-700"
                    />
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-medium">{wallet.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditWallet(wallet.id)}
                      className="text-slate-500 hover:text-blue-400 p-1"
                      title="Edit wallet"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteWallet(wallet.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Delete wallet (sweeps SOL to treasury)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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
                  <button
                    onClick={() => handleOpenPrivateKeyExport(wallet)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded text-sm"
                    title="Export private key"
                  >
                    <Key className="w-3 h-3" />
                  </button>
                </div>

                {renderWalletTokenSection(wallet)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Wallet Modal */}
      {showAddWalletModal && (
        <Modal onClose={() => setShowAddWalletModal(false)}>
          <h3 className="text-lg font-bold mb-4">Add Sub-Wallet{newWalletCount > 1 ? 's' : ''}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Wallet Name{newWalletCount > 1 ? ' (prefix)' : ''}</label>
              <input
                type="text"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                placeholder={newWalletCount > 1 ? 'e.g., Sniper → Sniper-1, Sniper-2...' : 'e.g., Sniper 1'}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">How Many Wallets</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={Math.min(20, 100 - wallets.length)}
                  value={newWalletCount}
                  onChange={(e) => { setNewWalletCount(parseInt(e.target.value) || 1); if (parseInt(e.target.value) > 1) setImportKey(''); }}
                  className="flex-1 accent-emerald-500"
                  disabled={!!importKey}
                />
                <span className="text-lg font-bold text-white w-8 text-center">{newWalletCount}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {wallets.length}/100 wallets used • {Math.min(20, 100 - wallets.length)} max per batch
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Import Key (optional, single wallet only)</label>
              <textarea
                value={importKey}
                onChange={(e) => { setImportKey(e.target.value); if (e.target.value) setNewWalletCount(1); }}
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
                onClick={() => { setShowAddWalletModal(false); setNewWalletName(''); setNewWalletCount(1); setImportKey(''); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSubWallet}
                disabled={isLoading || !newWalletName}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                  newWalletCount > 1 && !importKey ? `Add ${newWalletCount} Wallets` : 'Add Wallet'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Wallet Modal */}
      {showEditModal && (
        <Modal onClose={() => setShowEditModal(false)}>
          <h3 className="text-lg font-bold mb-4">Edit Wallet</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Wallet name"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowEditModal(false); setEditWalletId(''); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isLoading || !editName}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
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

      {/* Sell Max Confirmation Modal */}
      {pendingSell && (
        <Modal onClose={() => { if (!isSelling) setPendingSell(null); }}>
          <h3 className="text-lg font-bold mb-4 text-white">Confirm Sell Max</h3>
          <div className="space-y-4">
            <div className="p-3 bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-400">Wallet</p>
              <p className="font-medium text-white">{pendingSell.walletName}</p>
              <p className="font-mono text-xs text-slate-500">
                {pendingSell.walletAddress.slice(0, 10)}...{pendingSell.walletAddress.slice(-8)}
              </p>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-400">Token Mint</p>
              <p className="font-mono text-xs text-slate-300 break-all">{pendingSell.mint}</p>
              <p className="text-sm text-slate-400 mt-2">
                Amount: <span className="text-white">{formatTokenAmount(pendingSell.amountUi)}</span>
              </p>
            </div>

            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">
                This will sell the full token balance for this wallet using Jupiter.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPendingSell(null)}
                disabled={isSelling}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSell}
                disabled={isSelling}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg flex items-center justify-center gap-2"
              >
                {isSelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Selling...
                  </>
                ) : (
                  'Confirm Sell Max'
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Private Key Export Modal */}
      {pendingPrivateKeyExport && (
        <Modal onClose={() => { setPendingPrivateKeyExport(null); setIsPrivateKeyVisible(false); }}>
          <h3 className="text-lg font-bold mb-4 text-white">Export Private Key</h3>
          <div className="space-y-4">
            <div className="p-3 bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-400">Wallet</p>
              <p className="font-medium text-white">{pendingPrivateKeyExport.walletName}</p>
              <p className="font-mono text-xs text-slate-500">
                {pendingPrivateKeyExport.walletAddress.slice(0, 10)}...{pendingPrivateKeyExport.walletAddress.slice(-8)}
              </p>
            </div>

            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">
                Anyone with this private key can fully control and drain this wallet.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setIsPrivateKeyVisible(prev => !prev)}
                className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                {isPrivateKeyVisible ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Reveal
                  </>
                )}
              </button>
              <button
                onClick={() => copyToClipboard(pendingPrivateKeyExport.secretKeyJson, 'Private key')}
                disabled={!isPrivateKeyVisible}
                className="flex-1 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 disabled:bg-slate-700 disabled:text-slate-500 text-amber-300 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Key
              </button>
            </div>

            <textarea
              readOnly
              value={isPrivateKeyVisible ? pendingPrivateKeyExport.secretKeyJson : '********************************'}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg h-24 font-mono text-xs"
            />
            <p className="text-xs text-slate-500">
              Format: JSON byte array, compatible with the Import Key field.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setPendingPrivateKeyExport(null); setIsPrivateKeyVisible(false); }}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Close
              </button>
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


