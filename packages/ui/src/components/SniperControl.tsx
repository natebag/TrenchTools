import { useState } from 'react';
import { Target, Settings, Zap, Shield, AlertTriangle } from 'lucide-react';

interface SniperConfig {
  enabled: boolean;
  targetToken: string;
  amount: number;
  slippage: number;
  autoSell: boolean;
  takeProfit: number;
  stopLoss: number;
}

export function SniperControl() {
  const [config, setConfig] = useState<SniperConfig>({
    enabled: false,
    targetToken: '',
    amount: 0.05,
    slippage: 1,
    autoSell: true,
    takeProfit: 200,
    stopLoss: -50,
  });

  const [isSniping, setIsSniping] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target className="w-6 h-6 text-emerald-500" />
          Sniper Control
        </h1>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          config.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'
        }`}>
          {config.enabled ? '● Active' : '○ Inactive'}
        </div>
      </div>

      {/* Main Control */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setIsSniping(!isSniping)}
            className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
              isSniping
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {isSniping ? '⏹ STOP SNIPER' : '▶ START SNIPER'}
          </button>
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
            value={config.targetToken}
            onChange={(e) => setConfig({ ...config, targetToken: e.target.value })}
            placeholder="Enter token mint address..."
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Amount & Slippage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount (SOL)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.001"
              max="10"
              value={config.amount}
              onChange={(e) => setConfig({ ...config, amount: parseFloat(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
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
              max="5"
              value={config.slippage}
              onChange={(e) => setConfig({ ...config, slippage: parseFloat(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Auto-Sell Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-white">Auto-Sell</h2>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`w-12 h-6 rounded-full transition-colors ${
              config.autoSell ? 'bg-emerald-500' : 'bg-gray-600'
            }`}>
              <div className={`w-6 h-6 rounded-full bg-white transition-transform transform ${
                config.autoSell ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </div>
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
              value={config.takeProfit}
              onChange={(e) => setConfig({ ...config, takeProfit: parseFloat(e.target.value) })}
              className="w-full bg-emerald-900/30 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 font-mono"
            />
            <p className="text-xs text-emerald-500/70 mt-1">Sell when up {config.takeProfit}%</p>
          </div>
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
            <label className="block text-sm font-medium text-red-400 mb-2">
              Stop Loss (%)
            </label>
            <input
              type="number"
              value={config.stopLoss}
              onChange={(e) => setConfig({ ...config, stopLoss: parseFloat(e.target.value) })}
              className="w-full bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 font-mono"
            />
            <p className="text-xs text-red-500/70 mt-1">Cut losses at {Math.abs(config.stopLoss)}%</p>
          </div>
        </div>
      </div>

      {/* Sniper Guard */}
      <div className="bg-gray-800 rounded-lg p-6 border border-amber-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-white">Sniper Guard</h2>
        </div>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-400">
            Monitors external buys during launch. Triggers STOP_BUYING or EMERGENCY_EXIT when external volume exceeds threshold.
          </p>
        </div>
      </div>

      {/* Active Snipes */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-3 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <div>
                <p className="text-white font-medium">Sniper Active</p>
                <p className="text-xs text-gray-500">Awaiting target token</p>
              </div>
            </div>
            <span className="text-xs text-gray-500 font-mono">--</span>
          </div>
        </div>
      </div>
    </div>
  );
}
