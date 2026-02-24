/**
 * WalletTracker — track any Solana wallet's holdings, trades, and stats.
 * Copy-trade: auto-execute trades when tracked wallets buy/sell.
 *
 * Replaces the old WhaleAlerts component with richer wallet monitoring.
 * Three-panel layout: wallet list, detail view (holdings/trades/stats/copy), activity feed.
 */

import { useState, useCallback } from 'react';
import {
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Settings,
  Activity,
  BarChart3,
  Wallet,
  Copy,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { useWalletTracker } from '@/context/WalletTrackerContext';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { useToast } from './Toast';
import type {
  WalletHolding,
  WalletTrade,
  TraderStats,
  WalletTradeAlert,
  CopyTradeConfig,
  CopyTradeExecution,
} from '@trenchtools/core';
import { DEFAULT_COPY_TRADE_CONFIG } from '@trenchtools/core';

// ── Helpers ──

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// ── Quick Buy (copy-trade) ──

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
      const config = { rpcUrl, slippageBps: 500 };
      const quote = await dex.getQuote('pumpfun', SOL_MINT, mint, Math.round(amountSol * 1e9), config);
      const result = await dex.executeSwap(quote, keypairs[0], config);
      if (result.txHash) {
        toast.success(`Bought! Tx: ${result.txHash.slice(0, 12)}...`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Buy failed');
    } finally {
      setBuyingMint(null);
    }
  }, [getKeypairs, rpcUrl, toast]);

  return { buy, buyingMint };
}

// ── Tab Type ──

type DetailTab = 'holdings' | 'trades' | 'stats' | 'copy';
type MainView = 'detail' | 'activity' | 'settings';

// ── Main Component ──

export function WalletTracker() {
  const {
    trackedWallets,
    selectedWalletId,
    holdings,
    trades,
    stats,
    alerts,
    isPolling,
    isLoading,
    settings,
    copyConfigs,
    copyHistory,
    addWallet,
    removeWallet,
    selectWallet,
    refreshWallet,
    updateSettings,
    clearAlerts,
    dismissAlert,
    updateCopyConfig,
    clearCopyHistory,
  } = useWalletTracker();

  const [detailTab, setDetailTab] = useState<DetailTab>('holdings');
  const [mainView, setMainView] = useState<MainView>('detail');
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedWallet = trackedWallets.find(w => w.id === selectedWalletId);

  // Count active copy-trades
  const activeCopyCount = trackedWallets.filter(w => copyConfigs[w.address]?.enabled).length;

  const handleAdd = () => {
    if (!newAddress.trim()) return;
    addWallet(newAddress.trim(), newLabel.trim() || undefined);
    setNewAddress('');
    setNewLabel('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Eye className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Wallet Tracker</h2>
            <p className="text-sm text-slate-400">
              {trackedWallets.length} wallet{trackedWallets.length !== 1 ? 's' : ''} tracked
              {isPolling && <span className="ml-2 text-emerald-400">Polling</span>}
              {activeCopyCount > 0 && (
                <span className="ml-2 text-amber-400">
                  <Zap className="w-3 h-3 inline mr-0.5" />
                  {activeCopyCount} copying
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMainView(mainView === 'activity' ? 'detail' : 'activity')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              mainView === 'activity' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4 inline mr-1" />
            Activity {alerts.length > 0 && `(${alerts.length})`}
          </button>
          <button
            onClick={() => setMainView(mainView === 'settings' ? 'detail' : 'settings')}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              mainView === 'settings' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Wallet List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">Tracked Wallets</h3>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="mb-3 space-y-2 p-3 bg-slate-800/50 rounded-lg">
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Wallet address"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleAdd}
                  disabled={!newAddress.trim()}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
                >
                  Add Wallet
                </button>
              </div>
            )}

            {/* Wallet list */}
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {trackedWallets.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No wallets tracked yet.
                  <br />
                  Add one to get started!
                </p>
              ) : (
                trackedWallets.map(w => {
                  const isCopyEnabled = copyConfigs[w.address]?.enabled;
                  return (
                    <div
                      key={w.id}
                      onClick={() => { selectWallet(w.id); setMainView('detail'); }}
                      className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors group ${
                        selectedWalletId === w.id
                          ? 'bg-blue-500/20 border border-blue-500/30'
                          : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        selectedWalletId === w.id ? 'bg-blue-400' : 'bg-slate-600'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-200 truncate">{w.label}</p>
                          {isCopyEnabled && (
                            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 flex-shrink-0">
                              COPY
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{truncAddr(w.address)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={`https://solscan.io/account/${w.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 hover:bg-slate-700 rounded"
                        >
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeWallet(w.id); }}
                          className="p-1 hover:bg-red-500/20 rounded"
                        >
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Detail / Activity / Settings */}
        <div className="lg:col-span-3">
          {mainView === 'settings' ? (
            <SettingsPanel settings={settings} updateSettings={updateSettings} />
          ) : mainView === 'activity' ? (
            <ActivityFeed alerts={alerts} clearAlerts={clearAlerts} dismissAlert={dismissAlert} />
          ) : selectedWallet ? (
            <div className="space-y-4">
              {/* Wallet header */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{selectedWallet.label}</h3>
                      {copyConfigs[selectedWallet.address]?.enabled && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          COPY ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm text-slate-400 font-mono">{truncAddr(selectedWallet.address)}</code>
                      <button
                        onClick={() => navigator.clipboard.writeText(selectedWallet.address)}
                        className="p-1 hover:bg-slate-800 rounded"
                      >
                        <Copy className="w-3 h-3 text-slate-500" />
                      </button>
                      <a
                        href={`https://solscan.io/account/${selectedWallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Solscan
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={() => refreshWallet(selectedWallet.id)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                {([
                  { key: 'holdings' as DetailTab, label: 'Holdings', icon: Wallet, count: holdings.length },
                  { key: 'trades' as DetailTab, label: 'Trades', icon: Activity, count: trades.length },
                  { key: 'stats' as DetailTab, label: 'Stats', icon: BarChart3 },
                  { key: 'copy' as DetailTab, label: 'Copy Trade', icon: Zap },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                      detailTab === tab.key
                        ? tab.key === 'copy' && copyConfigs[selectedWallet.address]?.enabled
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="text-xs text-slate-500">({tab.count})</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {isLoading && detailTab !== 'copy' ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="ml-2 text-slate-400">Loading...</span>
                </div>
              ) : (
                <>
                  {detailTab === 'holdings' && <HoldingsTab holdings={holdings} />}
                  {detailTab === 'trades' && <TradesTab trades={trades} />}
                  {detailTab === 'stats' && <StatsTab stats={stats} />}
                  {detailTab === 'copy' && selectedWallet && (
                    <CopyTradeTab
                      config={copyConfigs[selectedWallet.address] || DEFAULT_COPY_TRADE_CONFIG}
                      history={copyHistory.filter(e => e.trackedWalletAddress === selectedWallet.address)}
                      allHistory={copyHistory}
                      updateConfig={(partial) => updateCopyConfig(selectedWallet.address, partial)}
                      clearHistory={clearCopyHistory}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
              <Eye className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-300 mb-2">Select a Wallet</h3>
              <p className="text-sm text-slate-500">
                Choose a tracked wallet from the list to view their holdings, trades, and stats.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Copy Trade Tab ──

function CopyTradeTab({
  config,
  history,
  allHistory,
  updateConfig,
  clearHistory,
}: {
  config: CopyTradeConfig;
  history: CopyTradeExecution[];
  allHistory: CopyTradeExecution[];
  updateConfig: (partial: Partial<CopyTradeConfig>) => void;
  clearHistory: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              config.enabled ? 'bg-amber-500/20' : 'bg-slate-800'
            }`}>
              <Zap className={`w-5 h-5 ${config.enabled ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Copy Trading</h3>
              <p className="text-xs text-slate-400">
                {config.enabled ? 'Auto-copying trades from this wallet' : 'Enable to auto-copy trades'}
              </p>
            </div>
          </div>
          <button
            onClick={() => updateConfig({ enabled: !config.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.enabled ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {config.enabled && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-300">
              When this wallet buys or sells, the same trade will be auto-executed with your wallet at {config.amountSol} SOL per buy.
            </p>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
        <h4 className="text-sm font-semibold text-slate-300">Copy Settings</h4>

        {/* SOL Amount */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Buy Amount (SOL)</label>
          <div className="flex gap-2 flex-wrap">
            {[0.01, 0.05, 0.1, 0.25, 0.5].map(amt => (
              <button
                key={amt}
                onClick={() => updateConfig({ amountSol: amt })}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  config.amountSol === amt
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {amt} SOL
              </button>
            ))}
            <input
              type="number"
              value={config.amountSol}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val > 0 && val <= 10) updateConfig({ amountSol: val });
              }}
              step="0.01"
              min="0.001"
              max="10"
              className="w-20 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white text-center focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Copy Buys / Sells */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.copyBuys}
              onChange={(e) => updateConfig({ copyBuys: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-300">Copy Buys</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.copySells}
              onChange={(e) => updateConfig({ copySells: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-slate-300">Copy Sells</span>
          </label>
        </div>

        {/* Slippage */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Slippage (bps)</label>
          <div className="flex gap-2">
            {[300, 500, 1000, 1500].map(bps => (
              <button
                key={bps}
                onClick={() => updateConfig({ slippageBps: bps })}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  config.slippageBps === bps
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Rate Limit */}
        <div>
          <label className="block text-xs text-slate-400 mb-2">Max Copies / Minute</label>
          <div className="flex gap-2">
            {[1, 3, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => updateConfig({ maxCopiesPerMinute: n })}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  config.maxCopiesPerMinute === n
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Execution History */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-slate-300">Copy History</h4>
            {history.length > 0 && (
              <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                {history.length}
              </span>
            )}
          </div>
          {allHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-800/50">
          {history.length === 0 ? (
            <div className="p-8 text-center">
              <Zap className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                No copy-trade executions yet.
                {!config.enabled && ' Enable copy trading to start.'}
              </p>
            </div>
          ) : (
            history.map(exec => (
              <div key={exec.id} className="p-3 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    exec.status === 'success' ? 'bg-emerald-500/20'
                      : exec.status === 'failed' ? 'bg-red-500/20'
                      : 'bg-yellow-500/20'
                  }`}>
                    {exec.status === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : exec.status === 'failed' ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        exec.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {exec.type.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-slate-200">{exec.tokenSymbol}</span>
                      <span className="text-xs text-slate-500">{exec.amountSol} SOL</span>
                    </div>
                    {exec.error && (
                      <p className="text-xs text-red-400 mt-0.5 truncate">{exec.error}</p>
                    )}
                    {exec.copySignature && (
                      <a
                        href={`https://solscan.io/tx/${exec.copySignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 mt-0.5 inline-block"
                      >
                        Tx: {exec.copySignature.slice(0, 12)}...
                      </a>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500">{timeAgo(exec.timestamp)}</p>
                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                      exec.status === 'success' ? 'bg-emerald-500/20 text-emerald-400'
                        : exec.status === 'failed' ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {exec.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Holdings Tab ──

function HoldingsTab({ holdings }: { holdings: WalletHolding[] }) {
  const { buy, buyingMint } = useQuickBuy();

  if (holdings.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center">
        <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No token holdings found.</p>
      </div>
    );
  }

  const sorted = [...holdings].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
            <tr>
              <th className="text-left text-xs text-slate-500 font-medium p-3">Token</th>
              <th className="text-right text-xs text-slate-500 font-medium p-3">Balance</th>
              <th className="text-right text-xs text-slate-500 font-medium p-3">Value</th>
              <th className="text-right text-xs text-slate-500 font-medium p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {sorted.map((h) => (
              <tr key={h.mint} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {h.imageUrl ? (
                      <img src={h.imageUrl} alt="" className="w-6 h-6 rounded-full" loading="lazy" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-700" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-slate-200">{h.symbol}</span>
                      <p className="text-xs text-slate-500 truncate max-w-[120px]">{h.name}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right">
                  <span className="text-sm text-slate-300 font-mono">
                    {h.balance < 0.01 ? h.balance.toExponential(2) : h.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="text-sm text-slate-400">
                    {h.usdValue ? `$${h.usdValue.toFixed(2)}` : '-'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => buy(h.mint, 0.05)}
                    disabled={buyingMint === h.mint}
                    className="px-2 py-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {buyingMint === h.mint ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : (
                      <>
                        <Zap className="w-3 h-3 inline mr-0.5" />
                        Buy
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Trades Tab ──

function TradesTab({ trades }: { trades: WalletTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center">
        <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No recent trades found. Helius API key may be needed.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-800/50">
        {trades.map(t => (
          <div key={t.signature} className="flex items-center gap-3 p-3 hover:bg-slate-800/30 transition-colors">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              t.type === 'buy' ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              {t.type === 'buy' ? (
                <ArrowDownRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowUpRight className="w-4 h-4 text-red-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  t.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {t.type.toUpperCase()}
                </span>
                <span className="text-sm font-medium text-slate-200">{t.tokenSymbol}</span>
                <span className="text-xs text-slate-500">{t.source}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">
                  {t.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                </span>
                <span className="text-xs text-slate-500">for</span>
                <span className="text-xs text-slate-300 font-mono">{t.solAmount.toFixed(4)} SOL</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-slate-500">{timeAgo(t.timestamp)}</p>
              <a
                href={`https://solscan.io/tx/${t.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Tx
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stats Tab ──

function StatsTab({ stats }: { stats: TraderStats | null }) {
  if (!stats || stats.totalTrades === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-center">
        <BarChart3 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No trade data available for statistics.</p>
      </div>
    );
  }

  const winRateColor = stats.winRate >= 60 ? 'text-emerald-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400';
  const pnlColor = stats.totalPnlSol >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Top row: Win Rate + PnL */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 text-center">
          <p className="text-sm text-slate-500 mb-1">Win Rate</p>
          <p className={`text-3xl font-bold ${winRateColor}`}>{stats.winRate.toFixed(1)}%</p>
          <div className="w-full bg-slate-800 rounded-full h-2 mt-3">
            <div
              className={`h-2 rounded-full ${stats.winRate >= 60 ? 'bg-emerald-500' : stats.winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(stats.winRate, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 text-center">
          <p className="text-sm text-slate-500 mb-1">Total PnL</p>
          <p className={`text-3xl font-bold ${pnlColor}`}>
            {stats.totalPnlSol >= 0 ? '+' : ''}{stats.totalPnlSol.toFixed(4)}
          </p>
          <p className="text-sm text-slate-500 mt-1">SOL</p>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Trades', value: stats.totalTrades.toString() },
          { label: 'Buys', value: stats.buyCount.toString() },
          { label: 'Sells', value: stats.sellCount.toString() },
          { label: 'Unique Tokens', value: stats.uniqueTokens.toString() },
          { label: 'Avg Hold Time', value: stats.avgHoldTimeMs > 0 ? formatDuration(stats.avgHoldTimeMs) : 'N/A' },
          { label: 'Best Trade', value: `+${stats.bestTradePnlSol.toFixed(4)} SOL`, color: 'text-emerald-400' },
          { label: 'Worst Trade', value: `${stats.worstTradePnlSol.toFixed(4)} SOL`, color: 'text-red-400' },
        ].map(item => (
          <div key={item.label} className="bg-slate-900 rounded-lg border border-slate-800 p-3">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={`text-sm font-semibold mt-1 ${(item as any).color || 'text-slate-200'}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity Feed ──

function ActivityFeed({
  alerts,
  clearAlerts,
  dismissAlert,
}: {
  alerts: WalletTradeAlert[];
  clearAlerts: () => void;
  dismissAlert: (id: string) => void;
}) {
  const { buy, buyingMint } = useQuickBuy();

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-300">Trade Activity</h3>
          {alerts.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
              {alerts.length}
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-800/50">
        {alerts.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No trade alerts yet. Add wallets and enable polling.</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className="p-3 hover:bg-slate-800/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  alert.trade.type === 'buy' ? 'bg-emerald-500/20' : 'bg-red-500/20'
                }`}>
                  {alert.trade.type === 'buy' ? (
                    <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{alert.walletLabel}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      alert.trade.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {alert.trade.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {alert.trade.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {alert.trade.tokenSymbol} for {alert.trade.solAmount.toFixed(4)} SOL
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => buy(alert.trade.tokenMint, 0.05)}
                      disabled={buyingMint === alert.trade.tokenMint}
                      className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded text-xs transition-colors disabled:opacity-50"
                    >
                      {buyingMint === alert.trade.tokenMint ? (
                        <Loader2 className="w-3 h-3 animate-spin inline" />
                      ) : 'Buy 0.05'}
                    </button>
                    <button
                      onClick={() => buy(alert.trade.tokenMint, 0.1)}
                      disabled={buyingMint === alert.trade.tokenMint}
                      className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded text-xs transition-colors disabled:opacity-50"
                    >
                      Buy 0.1
                    </button>
                    <a
                      href={`https://solscan.io/tx/${alert.trade.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Tx
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-slate-500">{timeAgo(alert.timestamp)}</span>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="p-1 hover:bg-slate-700 rounded"
                  >
                    <X className="w-3 h-3 text-slate-500" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Settings Panel ──

function SettingsPanel({
  settings,
  updateSettings,
}: {
  settings: import('@/context/WalletTrackerContext').TrackerSettings;
  updateSettings: (partial: Partial<import('@/context/WalletTrackerContext').TrackerSettings>) => void;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-5">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <Settings className="w-5 h-5 text-slate-400" />
        Tracker Settings
      </h3>

      {/* Polling interval */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">Polling Interval</label>
        <div className="flex gap-2">
          {[15, 30, 60, 120].map(sec => (
            <button
              key={sec}
              onClick={() => updateSettings({ pollingIntervalMs: sec * 1000 })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                settings.pollingIntervalMs === sec * 1000
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </div>

      {/* Alert preferences */}
      <div className="space-y-3">
        <label className="block text-sm text-slate-400">Alert Preferences</label>
        {[
          { key: 'alertOnBuy' as const, label: 'Alert on buys' },
          { key: 'alertOnSell' as const, label: 'Alert on sells' },
          { key: 'soundEnabled' as const, label: 'Sound notifications' },
        ].map(item => (
          <label key={item.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings[item.key]}
              onChange={(e) => updateSettings({ [item.key]: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-300">{item.label}</span>
          </label>
        ))}
      </div>

      {/* Max alerts */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">Max Stored Alerts</label>
        <div className="flex gap-2">
          {[50, 100, 200, 500].map(n => (
            <button
              key={n}
              onClick={() => updateSettings({ maxAlerts: n })}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                settings.maxAlerts === n
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WalletTracker;
