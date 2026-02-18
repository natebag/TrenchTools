/**
 * SniperControl - Real Sniper & Auto-Sell Engine
 * TrenchSniper OS
 * 
 * Wired to real:
 * - SniperGuardManager from @trenchtools/core
 * - WalletContext for persisted config
 * - Real position tracking and auto-sell triggers
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  Target,
  Settings,
  Zap,
  Shield,
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  ArrowDownToLine,
} from 'lucide-react';
import {
  SniperGuardManager,
  type Position,
} from '@trenchtools/core';
import { useWallet } from '@/context/WalletContext';
import { useActiveTokens } from '@/context/ActiveTokensContext';
import { useTxHistory } from '@/context/TxHistoryContext';
import { usePnL } from '@/context/PnLContext';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import {
  getQuote,
  executeSwap as dexExecuteSwap,
  KNOWN_MINTS,
  type DexConfig,
  type DexType,
} from '@/lib/dex';
import { getBondingCurveAddress } from '@/lib/dex/pumpfun';

interface SniperStatus {
  active: boolean;
  positions: number;
  totalInvested: number;
  pendingTriggers: number;
}

const WSOL = KNOWN_MINTS.WSOL;
const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_RESERVE_LAMPORTS = 5_000_000; // keep SOL for fees/rent

function formatMarketCap(mcap: number): string {
  if (mcap >= 1_000_000_000) return `$${(mcap / 1_000_000_000).toFixed(2)}B`;
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
  return `$${mcap.toFixed(0)}`;
}

export function SniperControl() {
  const {
    sniperConfig,
    updateSniperConfig,
    settings,
    wallets,
    addActivity,
  } = useWallet();

  const { addToken } = useActiveTokens();
  const { addTrade, getTradesForToken } = useTxHistory();
  const { openPositions, refreshPrices, refreshing } = usePnL();
  const { rpcUrl } = useNetwork();
  const { getKeypairs } = useSecureWallet({ rpcUrl });

  // Real sniper manager ref
  const managerRef = useRef<SniperGuardManager | null>(null);

  // Wallet selection (same pattern as VolumeControl)
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);

  // UI State
  const [isSniping, setIsSniping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SniperStatus>({
    active: false,
    positions: 0,
    totalInvested: 0,
    pendingTriggers: 0,
  });

  // Local config state (synced with context)
  const [localConfig, setLocalConfig] = useState({
    targetToken: '',
    amount: 0.05,
    slippage: sniperConfig.maxSlippage || 1,
    autoSell: sniperConfig.autoSell ?? true,
    takeProfit: sniperConfig.takeProfit || 200,
    stopLoss: sniperConfig.stopLoss || 50,
  });

  // Active positions from real manager
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentActivity, setRecentActivity] = useState<Array<{
    id: string;
    action: string;
    token: string;
    result: 'success' | 'pending' | 'failed';
    timestamp: Date;
  }>>([]);

  // Selling state: tracks which position (tokenMint) is currently being sold
  const [sellingMint, setSellingMint] = useState<string | null>(null);

  // Initialize manager with real connection
  useEffect(() => {
    if (settings.rpcUrl) {
      const connection = new Connection(settings.rpcUrl, 'confirmed');
      managerRef.current = new SniperGuardManager({
        connection,
        priorityFeeLamports: 50000,
      });

      // Listen to real events
      managerRef.current.engine.on('trigger:activated', (event: { positionId: string; triggerType?: string; tokenMint?: string }) => {
        setRecentActivity(prev => [{
          id: event.positionId,
          action: `${event.triggerType} triggered`,
          token: event.tokenMint?.slice(0, 8) || 'Unknown',
          result: 'pending' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 10));
      });

      managerRef.current.engine.on('position:closed', (event: { positionId: string; tokenMint?: string }) => {
        setRecentActivity(prev => [{
          id: event.positionId,
          action: 'Position closed',
          token: event.tokenMint?.slice(0, 8) || 'Unknown',
          result: 'success' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 10));
        
        // Refresh positions
        if (managerRef.current) {
          setPositions(managerRef.current.getPositions());
        }
      });
    }

    return () => {
      managerRef.current = null;
    };
  }, [settings.rpcUrl]);

  // Update status from real manager
  const updateStatus = useCallback(() => {
    if (managerRef.current) {
      const stats = managerRef.current.getStats();
      const activePositions = managerRef.current.getPositions();
      
      setPositions(activePositions);
      setStatus({
        active: isSniping,
        positions: stats.positions,
        totalInvested: stats.totalInvestedSol,
        pendingTriggers: activePositions.filter((p: Position) => p.status === 'open').length,
      });
    }
  }, [isSniping]);

  // Poll for updates when sniping
  useEffect(() => {
    if (isSniping) {
      const interval = setInterval(updateStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [isSniping, updateStatus]);

  // Sync config changes to context (persisted)
  const handleConfigChange = useCallback((updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    
    // Persist to context
    updateSniperConfig({
      maxSlippage: newConfig.slippage,
      autoSell: newConfig.autoSell,
      takeProfit: newConfig.takeProfit,
      stopLoss: newConfig.stopLoss,
      enabled: isSniping,
    });
  }, [localConfig, updateSniperConfig, isSniping]);

  // Start sniper — execute real buys via Jupiter for each selected wallet
  const handleStartSniper = useCallback(async () => {
    if (!localConfig.targetToken) {
      setError('Enter a target token address');
      return;
    }

    // Validate token address
    try {
      new PublicKey(localConfig.targetToken);
    } catch {
      setError('Invalid token address');
      return;
    }

    // Get signing keys
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      setError('Vault is locked. Unlock your wallet first.');
      return;
    }

    // Resolve wallets to use
    const activeWallets = selectedWalletIds.length > 0
      ? wallets.filter(w => selectedWalletIds.includes(w.id))
      : wallets;
    if (activeWallets.length === 0) {
      setError('No wallets available. Generate wallets first.');
      return;
    }

    // Map addresses → keypairs
    const keypairByAddress = new Map(
      allKeypairs.map(kp => [kp.publicKey.toBase58(), kp] as const)
    );

    setLoading(true);
    setError(null);
    setIsSniping(true);

    // Auto-detect DEX: check if token is on PumpFun bonding curve
    let dexToUse: DexType = 'jupiter';
    const connection = new Connection(rpcUrl, 'confirmed');
    try {
      const bondingCurve = getBondingCurveAddress(new PublicKey(localConfig.targetToken));
      const accountInfo = await connection.getAccountInfo(bondingCurve);
      if (accountInfo && accountInfo.data && accountInfo.data.length >= 49) {
        const complete = (accountInfo.data as Buffer).readUInt8(48) === 1;
        if (!complete) dexToUse = 'pumpfun';
      }
    } catch {
      // Default to Jupiter if detection fails
    }

    // Check Jupiter API key only if using Jupiter
    const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
    if (dexToUse === 'jupiter' && !jupiterApiKey) {
      setError('Jupiter API key required. Set it in Settings.');
      setLoading(false);
      setIsSniping(false);
      return;
    }

    // Update context
    updateSniperConfig({
      enabled: true,
      maxSlippage: localConfig.slippage,
      autoSell: localConfig.autoSell,
      takeProfit: localConfig.takeProfit,
      stopLoss: localConfig.stopLoss,
    });

    addActivity({
      type: 'scan',
      description: `Sniper activated targeting ${localConfig.targetToken.slice(0, 8)}... via ${dexToUse === 'pumpfun' ? 'PumpFun' : 'Jupiter'}`,
    });

    addToken({ mint: localConfig.targetToken, source: 'snipe' });

    setRecentActivity(prev => [{
      id: Date.now().toString(),
      action: `Sniper started (${dexToUse === 'pumpfun' ? 'PumpFun' : 'Jupiter'})`,
      token: localConfig.targetToken.slice(0, 8),
      result: 'success' as const,
      timestamp: new Date(),
    }, ...prev].slice(0, 10));

    const dexConfig: DexConfig = {
      rpcUrl,
      apiKey: dexToUse === 'jupiter' ? jupiterApiKey : undefined,
      slippageBps: Math.round(localConfig.slippage * 100),
    };
    const buyLamports = Math.max(1, Math.floor(localConfig.amount * LAMPORTS_PER_SOL));

    let successCount = 0;
    let failCount = 0;

    // Execute buy for each wallet sequentially
    for (const wallet of activeWallets) {
      const signer = keypairByAddress.get(wallet.address);
      if (!signer) {
        setRecentActivity(prev => [{
          id: Date.now().toString(),
          action: `No signer for ${wallet.name || wallet.address.slice(0, 6)}`,
          token: localConfig.targetToken.slice(0, 8),
          result: 'failed' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 20));
        failCount++;
        continue;
      }

      try {
        // Check wallet has enough SOL
        const solBalance = await connection.getBalance(new PublicKey(wallet.address), 'confirmed');
        const spendable = solBalance - SOL_RESERVE_LAMPORTS;
        if (spendable < buyLamports) {
          const balSol = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
          setRecentActivity(prev => [{
            id: Date.now().toString(),
            action: `${wallet.name || wallet.address.slice(0, 6)}: insufficient SOL (${balSol})`,
            token: localConfig.targetToken.slice(0, 8),
            result: 'failed' as const,
            timestamp: new Date(),
          }, ...prev].slice(0, 20));
          failCount++;
          continue;
        }

        // Get quote: SOL → target token
        const quote = await getQuote(
          dexToUse,
          WSOL,
          localConfig.targetToken,
          buyLamports,
          dexConfig
        );

        // Execute swap
        const result = await dexExecuteSwap(quote, signer, dexConfig);
        if (!result.success) {
          throw new Error(result.error || 'Swap failed');
        }

        successCount++;
        addActivity({
          type: 'buy',
          description: `Bought via ${wallet.name || wallet.address.slice(0, 6)} (${dexToUse === 'pumpfun' ? 'PumpFun' : 'Jupiter'})`,
          txHash: result.txHash,
          amount: localConfig.amount,
          token: localConfig.targetToken,
        });

        // Record to TxHistory so PnL system picks it up
        addTrade({
          timestamp: Date.now(),
          type: 'buy',
          tokenMint: localConfig.targetToken,
          amount: localConfig.amount,
          wallet: wallet.address,
          txHash: result.txHash,
          status: 'success',
          source: 'sniper',
        });

        setRecentActivity(prev => [{
          id: result.txHash || Date.now().toString(),
          action: `Buy success: ${wallet.name || wallet.address.slice(0, 6)}`,
          token: localConfig.targetToken.slice(0, 8),
          result: 'success' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 20));

      } catch (err) {
        console.error(`Sniper buy failed for ${wallet.address}:`, err);
        failCount++;
        setRecentActivity(prev => [{
          id: Date.now().toString(),
          action: `Buy failed: ${wallet.name || wallet.address.slice(0, 6)} — ${err instanceof Error ? err.message : 'unknown error'}`,
          token: localConfig.targetToken.slice(0, 8),
          result: 'failed' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 20));
      }
    }

    // Summary
    addActivity({
      type: 'scan',
      description: `Sniper complete: ${successCount} buys, ${failCount} failed`,
    });

    setRecentActivity(prev => [{
      id: Date.now().toString(),
      action: `Done: ${successCount} success, ${failCount} failed`,
      token: localConfig.targetToken.slice(0, 8),
      result: successCount > 0 ? 'success' as const : 'failed' as const,
      timestamp: new Date(),
    }, ...prev].slice(0, 20));

    // Trigger PnL price refresh after buys complete
    if (successCount > 0) {
      setTimeout(() => refreshPrices(), 2000);
    }

    setIsSniping(false);
    setLoading(false);
  }, [localConfig, wallets, selectedWalletIds, getKeypairs, rpcUrl, updateSniperConfig, addActivity, addToken, addTrade, refreshPrices]);

  // Stop sniper
  const handleStopSniper = useCallback(async () => {
    setLoading(true);
    
    try {
      setIsSniping(false);
      updateSniperConfig({ enabled: false });
      
      addActivity({
        type: 'scan',
        description: 'Sniper deactivated',
      });

      setRecentActivity(prev => [{
        id: Date.now().toString(),
        action: 'Sniper stopped',
        token: '--',
        result: 'success' as const,
        timestamp: new Date(),
      }, ...prev].slice(0, 10));

    } finally {
      setLoading(false);
    }
  }, [updateSniperConfig, addActivity]);

  // Emergency exit all positions
  const handleEmergencyExit = useCallback(async () => {
    if (!managerRef.current || positions.length === 0) return;
    
    if (!confirm(`Exit ALL ${positions.length} positions immediately?`)) return;

    setLoading(true);
    setError(null);

    try {
      for (const position of positions.filter(p => p.status === 'open')) {
        await managerRef.current.emergencyExit(position.id);
      }

      addActivity({
        type: 'sell',
        description: `Emergency exit: ${positions.length} positions closed`,
      });

      updateStatus();
    } catch (err) {
      console.error('Emergency exit failed:', err);
      setError(err instanceof Error ? err.message : 'Emergency exit failed');
    } finally {
      setLoading(false);
    }
  }, [positions, addActivity, updateStatus]);

  // Sell a position — sells from all wallets that bought this token
  const handleSellPosition = useCallback(async (tokenMint: string, tokenSymbol?: string) => {
    const label = tokenSymbol || tokenMint.slice(0, 8);

    // Get signing keys
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      setError('Vault is locked. Unlock your wallet first.');
      return;
    }

    const keypairByAddress = new Map(
      allKeypairs.map(kp => [kp.publicKey.toBase58(), kp] as const)
    );

    // Find wallets that traded this token
    const trades = getTradesForToken(tokenMint);
    const walletAddresses = [...new Set(trades.map(t => t.wallet))];
    if (walletAddresses.length === 0) {
      setError(`No trade history found for ${label}`);
      return;
    }

    setSellingMint(tokenMint);
    setError(null);

    // Auto-detect DEX
    let dexToUse: DexType = 'jupiter';
    const connection = new Connection(rpcUrl, 'confirmed');
    try {
      const bondingCurve = getBondingCurveAddress(new PublicKey(tokenMint));
      const accountInfo = await connection.getAccountInfo(bondingCurve);
      if (accountInfo && accountInfo.data && accountInfo.data.length >= 49) {
        const complete = (accountInfo.data as Buffer).readUInt8(48) === 1;
        if (!complete) dexToUse = 'pumpfun';
      }
    } catch { /* Default to Jupiter */ }

    const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
    if (dexToUse === 'jupiter' && !jupiterApiKey) {
      setError('Jupiter API key required for graduated tokens. Set it in Settings.');
      setSellingMint(null);
      return;
    }

    const dexConfig: DexConfig = {
      rpcUrl,
      apiKey: dexToUse === 'jupiter' ? jupiterApiKey : undefined,
      slippageBps: Math.round(localConfig.slippage * 100),
    };

    setRecentActivity(prev => [{
      id: Date.now().toString(),
      action: `Selling ${label} from ${walletAddresses.length} wallet(s) via ${dexToUse === 'pumpfun' ? 'PumpFun' : 'Jupiter'}`,
      token: tokenMint.slice(0, 8),
      result: 'pending' as const,
      timestamp: new Date(),
    }, ...prev].slice(0, 20));

    let successCount = 0;
    let failCount = 0;
    const WSOL_MINT = WSOL;

    for (const addr of walletAddresses) {
      const signer = keypairByAddress.get(addr);
      if (!signer) {
        failCount++;
        continue;
      }

      try {
        // Get on-chain token balance for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(addr),
          { mint: new PublicKey(tokenMint) }
        );
        const tokenAccount = tokenAccounts.value[0];
        if (!tokenAccount) {
          // No token account = nothing to sell
          continue;
        }
        const tokenBalance = tokenAccount.account.data.parsed?.info?.tokenAmount;
        const rawAmount = parseInt(tokenBalance?.amount || '0');
        if (rawAmount <= 0) continue;

        // Get quote: token → SOL
        let sold = false;

        // Try primary DEX first
        try {
          const quote = await getQuote(dexToUse, tokenMint, WSOL_MINT, rawAmount, dexConfig);
          const result = await dexExecuteSwap(quote, signer, dexConfig);
          if (result.success) {
            sold = true;
            successCount++;
            const solOut = (result.outputAmount || 0) / LAMPORTS_PER_SOL;
            addTrade({
              timestamp: Date.now(),
              type: 'sell',
              tokenMint,
              amount: solOut,
              wallet: addr,
              txHash: result.txHash,
              status: 'success',
              source: 'sniper',
            });
            setRecentActivity(prev => [{
              id: result.txHash || Date.now().toString(),
              action: `Sold ${label}: ${addr.slice(0, 6)}... → ${solOut.toFixed(4)} SOL`,
              token: tokenMint.slice(0, 8),
              result: 'success' as const,
              timestamp: new Date(),
            }, ...prev].slice(0, 20));
          } else {
            throw new Error(result.error || 'Swap failed');
          }
        } catch (primaryErr) {
          // Fallback: if we used Jupiter, try PumpFun and vice versa
          const fallbackDex: DexType = dexToUse === 'jupiter' ? 'pumpfun' : 'jupiter';
          if (fallbackDex === 'jupiter' && !jupiterApiKey) {
            throw primaryErr; // Can't fallback to Jupiter without API key
          }
          try {
            const fbConfig: DexConfig = { rpcUrl, apiKey: fallbackDex === 'jupiter' ? jupiterApiKey : undefined, slippageBps: dexConfig.slippageBps };
            const quote = await getQuote(fallbackDex, tokenMint, WSOL_MINT, rawAmount, fbConfig);
            const result = await dexExecuteSwap(quote, signer, fbConfig);
            if (result.success) {
              sold = true;
              successCount++;
              const solOut = (result.outputAmount || 0) / LAMPORTS_PER_SOL;
              addTrade({
                timestamp: Date.now(),
                type: 'sell',
                tokenMint,
                amount: solOut,
                wallet: addr,
                txHash: result.txHash,
                status: 'success',
                source: 'sniper',
              });
              setRecentActivity(prev => [{
                id: result.txHash || Date.now().toString(),
                action: `Sold ${label}: ${addr.slice(0, 6)}... → ${solOut.toFixed(4)} SOL (${fallbackDex})`,
                token: tokenMint.slice(0, 8),
                result: 'success' as const,
                timestamp: new Date(),
              }, ...prev].slice(0, 20));
            } else {
              throw new Error(result.error || 'Fallback swap failed');
            }
          } catch {
            throw primaryErr; // Report original error
          }
        }

        if (!sold) {
          failCount++;
        }
      } catch (err) {
        failCount++;
        setRecentActivity(prev => [{
          id: Date.now().toString(),
          action: `Sell failed: ${addr.slice(0, 6)}... — ${err instanceof Error ? err.message : 'unknown'}`,
          token: tokenMint.slice(0, 8),
          result: 'failed' as const,
          timestamp: new Date(),
        }, ...prev].slice(0, 20));
      }
    }

    // Summary
    setRecentActivity(prev => [{
      id: Date.now().toString(),
      action: `Sell ${label}: ${successCount} sold, ${failCount} failed`,
      token: tokenMint.slice(0, 8),
      result: successCount > 0 ? 'success' as const : 'failed' as const,
      timestamp: new Date(),
    }, ...prev].slice(0, 20));

    addActivity({
      type: 'sell',
      description: `Sold ${label}: ${successCount} wallets, ${failCount} failed`,
    });

    if (successCount > 0) {
      setTimeout(() => refreshPrices(), 2000);
    }

    setSellingMint(null);
  }, [getKeypairs, getTradesForToken, rpcUrl, localConfig.slippage, addTrade, addActivity, refreshPrices]);

  // Compute wallet counts for each open position from trade history
  const positionWalletCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pos of openPositions) {
      const trades = getTradesForToken(pos.tokenMint);
      const uniqueWallets = new Set(trades.map(t => t.wallet));
      counts.set(pos.tokenMint, uniqueWallets.size);
    }
    return counts;
  }, [openPositions, getTradesForToken]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target className="w-6 h-6 text-emerald-500" />
          Sniper Control
        </h1>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isSniping ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'
        }`}>
          {isSniping ? '● Active' : '○ Inactive'}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-gray-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Active Positions</div>
          <div className="text-2xl font-bold text-white">{status.positions}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Total Invested</div>
          <div className="text-2xl font-bold text-emerald-400">
            {status.totalInvested.toFixed(4)} SOL
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Pending Triggers</div>
          <div className="text-2xl font-bold text-amber-400">{status.pendingTriggers}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400">Selected Wallets</div>
          <div className="text-2xl font-bold text-blue-400">
            {selectedWalletIds.length > 0 ? selectedWalletIds.length : wallets.length}
          </div>
        </div>
      </div>

      {/* Main Control */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={isSniping ? handleStopSniper : handleStartSniper}
            disabled={loading}
            className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              isSniping
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            } disabled:opacity-50`}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isSniping ? (
              '⏹ STOP SNIPER'
            ) : (
              '▶ START SNIPER'
            )}
          </button>
          {positions.length > 0 && (
            <button
              onClick={handleEmergencyExit}
              disabled={loading}
              className="px-6 py-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 font-bold transition-colors"
            >
              🚨 EXIT ALL
            </button>
          )}
          <div className="flex items-center gap-2">
            <Zap className={`w-6 h-6 ${isSniping ? 'text-yellow-400 animate-pulse' : 'text-gray-600'}`} />
          </div>
        </div>

        {/* Token Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Target Token Address
          </label>
          <input
            type="text"
            value={localConfig.targetToken}
            onChange={(e) => handleConfigChange({ targetToken: e.target.value })}
            placeholder="Enter token mint address..."
            disabled={isSniping}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>

        {/* Amount & Slippage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount (SOL per wallet)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.001"
              max="10"
              value={localConfig.amount}
              onChange={(e) => handleConfigChange({ amount: parseFloat(e.target.value) || 0.01 })}
              disabled={isSniping}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Slippage (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={localConfig.slippage}
              onChange={(e) => handleConfigChange({ slippage: parseFloat(e.target.value) || 1 })}
              disabled={isSniping}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Wallet Selection */}
        {wallets.length > 0 && (
          <div className="pt-4 mt-4 border-t border-gray-700">
            <p className="text-sm font-medium text-gray-400 mb-3">Select wallets to use:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {wallets.map((w, i) => {
                const isSelected = selectedWalletIds.includes(w.id);
                return (
                  <label
                    key={w.id || i}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-gray-900 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWalletIds(prev => [...prev, w.id]);
                          } else {
                            setSelectedWalletIds(prev => prev.filter(id => id !== w.id));
                          }
                        }}
                        disabled={isSniping}
                        className="w-4 h-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 bg-gray-700"
                      />
                      <span className="text-sm text-white">{w.name || `Wallet ${i + 1}`}</span>
                    </div>
                    <span className="text-sm text-gray-400 font-mono">{(w.balance || 0).toFixed(4)} SOL</span>
                  </label>
                );
              })}
            </div>
            {selectedWalletIds.length === 0 && (
              <p className="text-xs text-yellow-400 mt-2">No wallets selected — will use all wallets</p>
            )}
          </div>
        )}
      </div>

      {/* Auto-Sell Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-white">Auto-Sell Configuration</h2>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => handleConfigChange({ autoSell: !localConfig.autoSell })}
              className={`w-12 h-6 rounded-full transition-colors ${
                localConfig.autoSell ? 'bg-emerald-500' : 'bg-gray-600'
              }`}
            >
              <div className={`w-6 h-6 rounded-full bg-white transition-transform transform ${
                localConfig.autoSell ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
            <span className="text-white">Enable Auto-Sell</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
            <label className="block text-sm font-medium text-emerald-400 mb-2">
              Take Profit (%)
            </label>
            <input
              type="number"
              value={localConfig.takeProfit}
              onChange={(e) => handleConfigChange({ takeProfit: parseFloat(e.target.value) || 100 })}
              disabled={!localConfig.autoSell}
              className="w-full bg-emerald-900/30 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 font-mono disabled:opacity-50"
            />
            <p className="text-xs text-emerald-500/70 mt-1">
              Sell when up {localConfig.takeProfit}% ({(localConfig.takeProfit / 100 + 1).toFixed(1)}x)
            </p>
          </div>
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
            <label className="block text-sm font-medium text-red-400 mb-2">
              Stop Loss (%)
            </label>
            <input
              type="number"
              value={localConfig.stopLoss}
              onChange={(e) => handleConfigChange({ stopLoss: parseFloat(e.target.value) || 50 })}
              disabled={!localConfig.autoSell}
              className="w-full bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 font-mono disabled:opacity-50"
            />
            <p className="text-xs text-red-500/70 mt-1">
              Cut losses at -{localConfig.stopLoss}%
            </p>
          </div>
        </div>
      </div>

      {/* Sniper Guard Info */}
      <div className="bg-gray-800 rounded-lg p-6 border border-amber-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-white">Sniper Guard</h2>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-400">
            <p>
              Real-time position monitoring with automatic triggers for take profit, stop loss, and trailing stops.
            </p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li>• Take profit: {localConfig.takeProfit}% ({(localConfig.takeProfit / 100 + 1).toFixed(1)}x)</li>
              <li>• Stop loss: -{localConfig.stopLoss}%</li>
              <li>• Auto-sell: {localConfig.autoSell ? 'Enabled' : 'Disabled'}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Position Cards (Axiom-style) */}
      {openPositions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Positions ({openPositions.length})
            </h2>
            <button
              onClick={() => refreshPrices()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
            >
              <Loader2 className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Updating...' : 'Refresh'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openPositions.map((pos) => {
              const isProfit = pos.unrealizedPnLSol >= 0;
              const walletCount = positionWalletCounts.get(pos.tokenMint) || 0;

              return (
                <div
                  key={pos.tokenMint}
                  className={`bg-gray-800 rounded-xl p-5 border transition-all hover:scale-[1.01] ${
                    isProfit
                      ? 'border-emerald-500/30 hover:border-emerald-500/50'
                      : 'border-red-500/30 hover:border-red-500/50'
                  }`}
                >
                  {/* Header: Token identity + wallet count */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {pos.tokenLogo ? (
                        <img src={pos.tokenLogo} alt={pos.tokenSymbol} className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                          <span className="text-sm font-bold text-white">
                            {(pos.tokenSymbol || pos.tokenMint.slice(0, 2)).charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-white font-semibold text-lg">
                          {pos.tokenSymbol || pos.tokenMint.slice(0, 8)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {pos.tokenName || `${pos.tokenMint.slice(0, 6)}...${pos.tokenMint.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-blue-500/15 px-2.5 py-1 rounded-full">
                      <WalletIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400">
                        {walletCount} wallet{walletCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Avg Entry</p>
                      <p className="text-sm text-white font-mono">
                        {pos.avgEntryPrice > 0 ? pos.avgEntryPrice.toExponential(2) : '--'} SOL
                      </p>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Market Cap</p>
                      <p className="text-sm text-white font-mono">
                        {pos.marketCap ? formatMarketCap(pos.marketCap) : '--'}
                      </p>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">SOL Invested</p>
                      <p className="text-sm text-white font-mono">{pos.totalSolSpent.toFixed(4)}</p>
                    </div>
                    <div className="bg-gray-900/60 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">Current Price</p>
                      <p className="text-sm text-white font-mono">
                        {pos.currentPriceUsd > 0 ? `$${pos.currentPriceUsd.toExponential(2)}` : '--'}
                      </p>
                    </div>
                  </div>

                  {/* PnL footer */}
                  <div className={`rounded-lg p-3 flex items-center justify-between ${
                    isProfit ? 'bg-emerald-500/10' : 'bg-red-500/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      {isProfit ? (
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      <p className={`text-lg font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{pos.unrealizedPnLSol.toFixed(4)} SOL
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                      isProfit
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isProfit ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(1)}%
                    </div>
                  </div>

                  {/* Quick Sell Button */}
                  <button
                    onClick={() => handleSellPosition(pos.tokenMint, pos.tokenSymbol)}
                    disabled={sellingMint !== null}
                    className="w-full mt-3 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sellingMint === pos.tokenMint ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Selling...</>
                    ) : (
                      <><ArrowDownToLine className="w-4 h-4" />Sell All ({walletCount} wallet{walletCount !== 1 ? 's' : ''})</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <div className="space-y-2">
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No activity yet. Start the sniper to begin.</p>
            </div>
          ) : (
            recentActivity.map((activity, idx) => (
              <div
                key={`${activity.id}-${idx}`}
                className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  {activity.result === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : activity.result === 'pending' ? (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <div>
                    <p className="text-white font-medium">{activity.action}</p>
                    <p className="text-xs text-gray-500 font-mono">{activity.token}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {activity.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
