import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';

interface PnLData {
  realized: number;
  unrealized: number;
  total: number;
  winRate: number;
  trades: number;
}

const mockData: PnLData = {
  realized: 2.45,
  unrealized: 0.89,
  total: 3.34,
  winRate: 68.5,
  trades: 15,
};

export function PnLCharts() {
  const [timeframe, setTimeframe] = useState('24h');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <PieChart className="w-6 h-6 text-emerald-500" />
          P&L Analytics
        </h1>
        <div className="flex gap-2">
          {['24h', '7d', '30d', 'All'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-500/10 rounded-lg p-6 border border-emerald-500/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <span className="text-sm text-emerald-400">Total P&L</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            +{mockData.total.toFixed(4)} SOL
          </div>
          <div className="text-sm text-emerald-500/70 mt-1">+{((mockData.total / 10) * 100).toFixed(1)}%</div>
        </div>

        <div className="bg-blue-500/10 rounded-lg p-6 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-blue-400">Realized</span>
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {mockData.realized.toFixed(4)} SOL
          </div>
          <div className="text-sm text-blue-500/70 mt-1">Completed trades</div>
        </div>

        <div className="bg-purple-500/10 rounded-lg p-6 border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-purple-400">Unrealized</span>
          </div>
          <div className="text-3xl font-bold text-purple-400">
            {mockData.unrealized.toFixed(4)} SOL
          </div>
          <div className="text-sm text-purple-500/70 mt-1">Open positions</div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Win Rate</div>
          <div className="text-2xl font-bold text-white">{mockData.winRate}%</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Total Trades</div>
          <div className="text-2xl font-bold text-white">{mockData.trades}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Wins</div>
          <div className="text-2xl font-bold text-emerald-400">{Math.round((mockData.winRate / 100) * mockData.trades)}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Losses</div>
          <div className="text-2xl font-bold text-red-400">{Math.round(mockData.trades - (mockData.winRate / 100) * mockData.trades)}</div>
        </div>
      </div>

      {/* Placeholder for Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Portfolio Performance</h2>
        <div className="h-64 bg-gray-900 rounded-lg flex items-center justify-center">
          <div className="text-gray-500 text-center">
            <TrendingUp className="w-12 h-12 mx-auto mb-2 text-emerald-500/50" />
            <p>Chart integration coming soon</p>
            <p className="text-sm text-gray-600">Connect wallet to view real data</p>
          </div>
        </div>
      </div>

      {/* Recent Trades */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Trades</h2>
        <div className="space-y-2">
          {[
            { token: 'BONK', side: 'buy', amount: 0.05, pnl: 1.23, time: '2m ago' },
            { token: 'SAMO', side: 'sell', amount: 0.03, pnl: 0.45, time: '5m ago' },
            { token: 'MYRO', side: 'buy', amount: 0.02, pnl: -0.12, time: '12m ago' },
          ].map((trade, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${trade.side === 'buy' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div>
                  <p className="text-white font-medium">${trade.token}</p>
                  <p className="text-xs text-gray-500">{trade.side.toUpperCase()} • {trade.amount} SOL</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-mono font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trade.pnl >= 0 ? '+' : ''}{trade.pnl} SOL
                </p>
                <p className="text-xs text-gray-500">{trade.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
