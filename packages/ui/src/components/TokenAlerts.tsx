/**
 * TokenAlerts — real-time PumpFun new token launch feed with one-click buy.
 *
 * Features:
 * - Live stream of new PumpFun tokens via WebSocket (self-hosted) or SSE (hosted)
 * - Inline SafetyBadge per token (optional, controlled by settings)
 * - Quick-buy button using existing PumpFun DEX layer
 * - Filters: market cap, initial buy, keyword
 * - Settings: enable/disable, default buy amount, auto-scan, sound
 */

import { useState, useCallback } from 'react';
import {
  Bell,
  BellOff,
  Loader2,
  ExternalLink,
  Filter,
  Settings,
  Trash2,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTokenAlerts } from '@/context/TokenAlertsContext';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { useToast } from './Toast';
import { SafetyBadge } from './SafetyBadge';
import type { NewTokenAlert } from '@trenchtools/core';

// ── Time formatting ──────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Quick Buy logic ──────────────────────────────────────────────────────────

function useQuickBuy() {
  const { getKeypairs } = useSecureWallet();
  const { rpcUrl } = useNetwork();
  const toast = useToast();
  const [buyingMint, setBuyingMint] = useState<string | null>(null);

  const buy = useCallback(async (mint: string, amountSol: number) => {
    setBuyingMint(mint);
    try {
      const keypairs = getKeypairs();
      if (!keypairs.length) {
        toast.error('No wallets available. Create one in the Wallets tab.');
        return;
      }

      const dex = await import('@/lib/dex/index');
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      const config = {
        rpcUrl,
        slippageBps: 500, // 5%
      };

      const quote = await dex.getQuote(
        'pumpfun',
        SOL_MINT,
        mint,
        Math.round(amountSol * 1e9), // lamports
        config,
      );

      const result = await dex.executeSwap(quote, keypairs[0], config);
      if (result.txHash) {
        toast.success(`Bought! Tx: ${result.txHash.slice(0, 12)}...`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Buy failed';
      toast.error(msg);
    } finally {
      setBuyingMint(null);
    }
  }, [getKeypairs, rpcUrl, toast]);

  return { buy, buyingMint };
}

// ── AlertCard ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onBuy,
  buying,
  showSafety,
  defaultBuyAmount,
  onDismiss,
}: {
  alert: NewTokenAlert;
  onBuy: (mint: string, amount: number) => void;
  buying: boolean;
  showSafety: boolean;
  defaultBuyAmount: number;
  onDismiss: (id: string) => void;
}) {
  const creator = alert.creator
    ? `${alert.creator.slice(0, 4)}...${alert.creator.slice(-4)}`
    : '???';

  return (
    <div className="flex items-start gap-3 py-3 px-4 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors">
      {/* Token icon placeholder */}
      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Zap className="w-5 h-5 text-purple-400" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">
            {alert.name}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            ${alert.symbol}
          </span>
          <span className="text-xs text-slate-500">{timeAgo(alert.timestamp)}</span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
          <span>MCap: <span className="text-slate-300">{alert.marketCapSol.toFixed(1)} SOL</span></span>
          <span>Dev: <span className="text-slate-300">{alert.initialBuySol.toFixed(3)} SOL</span></span>
          <span>Creator: <span className="text-slate-300 font-mono">{creator}</span></span>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <button
            className="text-xs text-slate-500 hover:text-slate-300 font-mono truncate"
            onClick={() => navigator.clipboard.writeText(alert.mint)}
            title="Copy CA"
          >
            {alert.mint.slice(0, 8)}...{alert.mint.slice(-6)}
          </button>
          <a
            href={`https://pump.fun/${alert.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-blue-400"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          {showSafety && <SafetyBadge tokenMint={alert.mint} compact />}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <button
          onClick={() => onBuy(alert.mint, defaultBuyAmount)}
          disabled={buying}
          className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
        >
          {buying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            `Buy ${defaultBuyAmount} SOL`
          )}
        </button>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-slate-600 hover:text-slate-400 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TokenAlerts() {
  const {
    alerts,
    isConnected,
    settings,
    filters,
    setEnabled,
    setFilters,
    updateSettings,
    clearAlerts,
    dismissAlert,
  } = useTokenAlerts();
  const { buy, buyingMint } = useQuickBuy();
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Local filter state for editing
  const [localFilters, setLocalFilters] = useState(filters);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">New Token Alerts</h2>
            <p className="text-sm text-slate-400">Real-time PumpFun launches</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isConnected ? 'Live' : 'Offline'}
          </div>

          {/* Toggle button */}
          <button
            onClick={() => setEnabled(!settings.enabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              settings.enabled
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            }`}
          >
            {settings.enabled ? (
              <><BellOff className="w-4 h-4" /> Stop</>
            ) : (
              <><Bell className="w-4 h-4" /> Start</>
            )}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showFilters ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-slate-300'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showSettings ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-slate-300'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:text-red-400 transition-colors ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear ({alerts.length})
          </button>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min MCap (SOL)</label>
              <input
                type="number"
                value={localFilters.minMarketCapSol ?? ''}
                onChange={(e) => setLocalFilters({ ...localFilters, minMarketCapSol: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Max MCap (SOL)</label>
              <input
                type="number"
                value={localFilters.maxMarketCapSol ?? ''}
                onChange={(e) => setLocalFilters({ ...localFilters, maxMarketCapSol: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="No max"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min Dev Buy (SOL)</label>
              <input
                type="number"
                value={localFilters.minInitialBuySol ?? ''}
                onChange={(e) => setLocalFilters({ ...localFilters, minInitialBuySol: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Keyword</label>
              <input
                type="text"
                value={localFilters.nameKeyword ?? ''}
                onChange={(e) => setLocalFilters({ ...localFilters, nameKeyword: e.target.value || undefined })}
                placeholder="Search name/symbol"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters(localFilters)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={() => { setLocalFilters({}); setFilters({}); }}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Default Buy Amount */}
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Default Buy Amount (SOL)</label>
              <div className="flex gap-2">
                {[0.01, 0.05, 0.1, 0.5].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => updateSettings({ defaultBuyAmountSol: amt })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      settings.defaultBuyAmountSol === amt
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    {amt} SOL
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSafetyScan}
                  onChange={(e) => updateSettings({ autoSafetyScan: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-300">Auto safety scan on new tokens</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-300">Sound notification</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-500 mb-2">
              {settings.enabled ? 'Waiting for new tokens...' : 'Alerts are off'}
            </h3>
            <p className="text-sm text-slate-600">
              {settings.enabled
                ? 'New PumpFun token launches will appear here in real-time.'
                : 'Click "Start" to begin monitoring new PumpFun token launches.'}
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onBuy={buy}
              buying={buyingMint === alert.mint}
              showSafety={settings.autoSafetyScan}
              defaultBuyAmount={settings.defaultBuyAmountSol}
              onDismiss={dismissAlert}
            />
          ))
        )}
      </div>
    </div>
  );
}
