import { useState } from 'react';
import { 
  Fish, 
  Plus, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Eye,
  EyeOff,
  ExternalLink,
  Clock,
  Settings,
  X,
  Wallet,
  Zap,
  Activity
} from 'lucide-react';
import { useWhale, type WhaleAlert } from '@/context/WhaleContext';

function AlertIcon({ type }: { type: WhaleAlert['type'] }) {
  switch (type) {
    case 'large_buy':
      return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    case 'large_sell':
      return <TrendingDown className="w-5 h-5 text-red-400" />;
    case 'accumulation':
      return <Zap className="w-5 h-5 text-blue-400" />;
    case 'draining':
      return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    case 'large_transfer':
      return <Activity className="w-5 h-5 text-purple-400" />;
    default:
      return <Fish className="w-5 h-5 text-slate-400" />;
  }
}

function AlertTypeLabel({ type }: { type: WhaleAlert['type'] }) {
  const labels: Record<WhaleAlert['type'], { text: string; color: string }> = {
    large_buy: { text: 'BUY', color: 'bg-emerald-500/20 text-emerald-400' },
    large_sell: { text: 'SELL', color: 'bg-red-500/20 text-red-400' },
    accumulation: { text: 'ACCUMULATE', color: 'bg-blue-500/20 text-blue-400' },
    draining: { text: 'DRAINING', color: 'bg-orange-500/20 text-orange-400' },
    large_transfer: { text: 'TRANSFER', color: 'bg-purple-500/20 text-purple-400' },
  };
  
  const label = labels[type];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${label.color}`}>
      {label.text}
    </span>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function WhaleAlerts() {
  const {
    watchedWallets,
    alerts,
    isPolling,
    pollingInterval,
    lastPollTime,
    minSolAmount,
    addWallet,
    removeWallet,
    updateWalletLabel,
    clearAlerts,
    dismissAlert,
    setPollingInterval,
    setMinSolAmount,
    startPolling,
    stopPolling,
    pollNow,
  } = useWhale();

  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleAddWallet = () => {
    if (!newAddress.trim()) return;
    addWallet(newAddress.trim(), newLabel.trim() || undefined);
    setNewAddress('');
    setNewLabel('');
    setIsAdding(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await pollNow();
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
            <Fish className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Whale Alerts</h1>
            <p className="text-sm text-slate-400">Watch wallets for large transactions</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={isPolling ? stopPolling : startPolling}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isPolling 
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isPolling ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {isPolling ? 'Watching' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            Alert Settings
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Minimum SOL Amount
              </label>
              <input
                type="number"
                value={minSolAmount}
                onChange={(e) => setMinSolAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                min="0"
                step="1"
              />
              <p className="text-xs text-slate-500 mt-1">Alert on transactions ≥ this amount</p>
            </div>
            
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Polling Interval (seconds)
              </label>
              <input
                type="number"
                value={pollingInterval / 1000}
                onChange={(e) => setPollingInterval((parseFloat(e.target.value) || 60) * 1000)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                min="30"
                step="10"
              />
              <p className="text-xs text-slate-500 mt-1">Minimum 30 seconds</p>
            </div>
          </div>
          
          {lastPollTime && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last checked: {formatTimeAgo(lastPollTime)}
            </p>
          )}
        </div>
      )}

      {/* Watched Wallets */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-slate-400" />
            Watched Wallets ({watchedWallets.length})
          </h2>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Wallet
          </button>
        </div>

        {/* Add Wallet Form */}
        {isAdding && (
          <div className="p-4 border-b border-slate-700 bg-slate-900/50">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Wallet address (e.g., 7xKXt...)"
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white font-mono text-sm"
              />
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional)"
                className="sm:w-48 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddWallet}
                  disabled={!newAddress.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setIsAdding(false); setNewAddress(''); setNewLabel(''); }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wallet List */}
        <div className="divide-y divide-slate-700/50">
          {watchedWallets.length === 0 ? (
            <div className="p-8 text-center">
              <Fish className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No wallets being watched</p>
              <p className="text-sm text-slate-500 mt-1">Add a wallet address to start tracking whale activity</p>
            </div>
          ) : (
            watchedWallets.map((wallet) => (
              <div key={wallet.id} className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-5 h-5 text-slate-300" />
                  </div>
                  <div className="min-w-0">
                    <input
                      type="text"
                      value={wallet.label}
                      onChange={(e) => updateWalletLabel(wallet.id, e.target.value)}
                      className="bg-transparent border-none text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1 -ml-1"
                    />
                    <p className="text-sm text-slate-500 font-mono truncate">
                      {wallet.address}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={`https://solscan.io/account/${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => removeWallet(wallet.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Alert Feed */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-400" />
            Recent Alerts ({alerts.length})
          </h2>
          {alerts.length > 0 && (
            <button
              onClick={clearAlerts}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-700/50 max-h-[500px] overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No alerts yet</p>
              <p className="text-sm text-slate-500 mt-1">Alerts will appear here when whales make moves</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="p-4 hover:bg-slate-800/50 transition-colors group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertIcon type={alert.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <AlertTypeLabel type={alert.type} />
                      <span className="text-sm text-slate-400">
                        {alert.walletLabel || `${alert.walletAddress.slice(0, 6)}...${alert.walletAddress.slice(-4)}`}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatTimeAgo(alert.timestamp)}
                      </span>
                    </div>
                    <p className="text-white">{alert.description}</p>
                    {alert.amount > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-lg font-bold ${
                          alert.type === 'large_buy' || alert.type === 'accumulation' 
                            ? 'text-emerald-400' 
                            : 'text-red-400'
                        }`}>
                          {alert.amount.toFixed(2)} SOL
                        </span>
                        {alert.amountUsd && (
                          <span className="text-slate-400">
                            (${alert.amountUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                          </span>
                        )}
                      </div>
                    )}
                    <a
                      href={`https://solscan.io/tx/${alert.txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 mt-2 transition-colors"
                    >
                      View Transaction <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-700 transition-all text-slate-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Total Alerts</p>
            <p className="text-2xl font-bold text-white">{alerts.length}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Buys Detected</p>
            <p className="text-2xl font-bold text-emerald-400">
              {alerts.filter(a => a.type === 'large_buy' || a.type === 'accumulation').length}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Sells Detected</p>
            <p className="text-2xl font-bold text-red-400">
              {alerts.filter(a => a.type === 'large_sell' || a.type === 'draining').length}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            <p className="text-sm text-slate-400">Rug Warnings</p>
            <p className="text-2xl font-bold text-orange-400">
              {alerts.filter(a => a.type === 'draining').length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
