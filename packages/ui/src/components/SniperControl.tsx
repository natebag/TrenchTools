/**
 * SniperControl - Real Sniper & Auto-Sell Engine
 * TrenchSniper OS
 * 
 * Wired to real:
 * - SniperGuardManager from @trenchsniper/core
 * - WalletContext for persisted config
 * - Real position tracking and auto-sell triggers
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection } from '@solana/web3.js';
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
} from 'lucide-react';
import {
  SniperGuardManager,
  type Position,
} from '@trenchsniper/core';
import { useWallet } from '@/context/WalletContext';
import { useActiveTokens } from '@/context/ActiveTokensContext';

interface SniperStatus {
  active: boolean;
  positions: number;
  totalInvested: number;
  pendingTriggers: number;
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

  // Real sniper manager ref
  const managerRef = useRef<SniperGuardManager | null>(null);

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

  // Start sniper with real config
  const handleStartSniper = useCallback(async () => {
    if (!localConfig.targetToken) {
      setError('Enter a target token address');
      return;
    }

    // Check for sniper wallets
    const sniperWallets = wallets.filter(w => w.type === 'sniper');
    if (sniperWallets.length === 0) {
      setError('No sniper wallets configured. Generate wallets first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setIsSniping(true);
      
      // Update context with enabled state
      updateSniperConfig({
        enabled: true,
        maxSlippage: localConfig.slippage,
        autoSell: localConfig.autoSell,
        takeProfit: localConfig.takeProfit,
        stopLoss: localConfig.stopLoss,
      });

      addActivity({
        type: 'scan',
        description: `Sniper activated targeting ${localConfig.targetToken.slice(0, 8)}...`,
      });

      // Add token to active tokens for Detection Dashboard
      addToken({
        mint: localConfig.targetToken,
        source: 'snipe'
      });

      setRecentActivity(prev => [{
        id: Date.now().toString(),
        action: 'Sniper started',
        token: localConfig.targetToken.slice(0, 8),
        result: 'success' as const,
        timestamp: new Date(),
      }, ...prev].slice(0, 10));

      // In production, this would connect to websocket for token launches
      // and trigger real buy transactions

    } catch (err) {
      console.error('Failed to start sniper:', err);
      setError(err instanceof Error ? err.message : 'Failed to start sniper');
      setIsSniping(false);
    } finally {
      setLoading(false);
    }
  }, [localConfig, wallets, updateSniperConfig, addActivity]);

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
          <div className="text-sm text-gray-400">Sniper Wallets</div>
          <div className="text-2xl font-bold text-blue-400">
            {wallets.filter(w => w.type === 'sniper').length}
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

      {/* Active Positions */}
      {positions.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">
            Active Positions ({positions.length})
          </h2>
          <div className="space-y-2">
            {positions.map((position) => (
              <div
                key={position.id}
                className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    position.status === 'open' 
                      ? 'bg-emerald-500 animate-pulse' 
                      : position.status === 'partial' 
                        ? 'bg-amber-500' 
                        : 'bg-gray-500'
                  }`} />
                  <div>
                    <p className="text-white font-medium font-mono">
                      {position.tokenMint.slice(0, 8)}...{position.tokenMint.slice(-4)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Entry: {position.entrySolAmount.toFixed(4)} SOL @ {position.entryPrice.toFixed(8)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-medium ${
                    position.peakMultiplier >= 1 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {position.peakMultiplier.toFixed(2)}x
                  </p>
                  <p className="text-xs text-gray-500">
                    {position.remainingTokens.toLocaleString()} tokens
                  </p>
                </div>
              </div>
            ))}
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
