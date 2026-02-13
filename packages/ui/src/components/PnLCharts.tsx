/**
 * PnLCharts - Real P&L Analytics with Visualizations
 * TrenchSniper OS
 * 
 * Features:
 * - Per-token P&L cards (entry, current, % change, SOL value)
 * - Portfolio total value chart over time
 * - Win/Loss ratio visualization
 * - Best/Worst trades display
 * - Real-time price updates from DexScreener
 */

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  RefreshCw,
  Loader2,
  Clock,
  BarChart3,
  Award,
  Skull,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Percent,
  Trash2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { usePnL, TokenPosition, TradeResult } from '@/context/PnLContext';

type TimeframeFilter = '24h' | '7d' | '30d' | 'All';
type ViewMode = 'overview' | 'positions' | 'history';

// Color constants
const COLORS = {
  profit: '#10B981',
  loss: '#EF4444',
  neutral: '#6B7280',
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  warning: '#F59E0B',
};

// Format time for charts
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Token P&L Card Component
function TokenPnLCard({ position }: { position: TokenPosition }) {
  const isProfit = position.totalPnLSol >= 0;
  const hasHoldings = position.tokensHeld > 0;
  
  return (
    <div className={`rounded-lg p-4 border transition-all hover:scale-[1.02] ${
      isProfit 
        ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50' 
        : 'bg-red-500/10 border-red-500/30 hover:border-red-500/50'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {position.tokenLogo ? (
            <img 
              src={position.tokenLogo} 
              alt={position.tokenSymbol} 
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {(position.tokenSymbol || position.tokenMint.slice(0, 2)).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="font-semibold text-white">
              {position.tokenSymbol || position.tokenMint.slice(0, 8)}
            </p>
            <p className="text-xs text-gray-500 font-mono">
              {position.tokenMint.slice(0, 6)}...{position.tokenMint.slice(-4)}
            </p>
          </div>
        </div>
        {hasHoldings && (
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Open position" />
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Entry Price</p>
          <p className="text-white font-mono">
            {position.avgEntryPrice > 0 ? position.avgEntryPrice.toExponential(2) : '—'} SOL
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Current Price</p>
          <p className="text-white font-mono">
            {position.currentPrice > 0 ? position.currentPrice.toExponential(2) : '—'} SOL
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">SOL Spent</p>
          <p className="text-white font-mono">{position.totalSolSpent.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">SOL Received</p>
          <p className="text-white font-mono">{position.solReceived.toFixed(4)}</p>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between">
        <div>
          <p className={`text-lg font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{position.totalPnLSol.toFixed(6)} SOL
          </p>
          <p className={`text-xs ${isProfit ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
            {isProfit ? '+' : ''}{position.totalPnLPercent.toFixed(1)}% ROI
          </p>
        </div>
        {hasHoldings && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Holding</p>
            <p className="text-sm text-purple-400">
              {position.tokensHeld.toLocaleString()} tokens
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Trade Result Card
function TradeResultCard({ trade, type }: { trade: TradeResult; type: 'best' | 'worst' }) {
  const isBest = type === 'best';
  
  return (
    <div className={`rounded-lg p-4 border ${
      isBest 
        ? 'bg-emerald-500/10 border-emerald-500/30' 
        : 'bg-red-500/10 border-red-500/30'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {isBest ? (
          <Award className="w-5 h-5 text-emerald-400" />
        ) : (
          <Skull className="w-5 h-5 text-red-400" />
        )}
        <span className={`text-sm font-medium ${isBest ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBest ? 'Best Trade' : 'Worst Trade'}
        </span>
      </div>
      
      <p className="text-white font-semibold mb-1">
        {trade.tokenSymbol || trade.tokenMint.slice(0, 8)}
      </p>
      
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xl font-bold ${isBest ? 'text-emerald-400' : 'text-red-400'}`}>
            {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)} SOL
          </p>
          <p className={`text-xs ${isBest ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
            {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>Hold time: {formatDuration(trade.holdTimeMs)}</p>
          <p>{formatDate(trade.closedAt)}</p>
        </div>
      </div>
    </div>
  );
}

// Custom Tooltip for Charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-gray-400">{entry.name}:</span>
          <span className={`text-sm font-medium ${
            entry.value >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value} SOL
          </span>
        </div>
      ))}
    </div>
  );
}

export function PnLCharts() {
  const {
    positions,
    openPositions,
    closedTrades,
    portfolioHistory,
    stats,
    loading,
    refreshing,
    refreshPrices,
    clearPnLData,
  } = usePnL();
  
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('7d');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  // Filter portfolio history by timeframe
  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    
    let startTime = 0;
    switch (timeframe) {
      case '24h': startTime = now - msPerDay; break;
      case '7d': startTime = now - 7 * msPerDay; break;
      case '30d': startTime = now - 30 * msPerDay; break;
      default: startTime = 0;
    }
    
    return portfolioHistory
      .filter(s => s.timestamp >= startTime)
      .map(s => ({
        ...s,
        time: formatTime(s.timestamp),
        date: formatDate(s.timestamp),
      }));
  }, [portfolioHistory, timeframe]);

  // Prepare win/loss pie chart data
  const winLossData = useMemo(() => [
    { name: 'Wins', value: stats.winCount, color: COLORS.profit },
    { name: 'Losses', value: stats.lossCount, color: COLORS.loss },
  ], [stats]);

  // Prepare P&L distribution data
  const pnlDistribution = useMemo(() => {
    const bins: { range: string; count: number; color: string }[] = [
      { range: '< -50%', count: 0, color: COLORS.loss },
      { range: '-50% to -20%', count: 0, color: '#F87171' },
      { range: '-20% to 0%', count: 0, color: '#FCA5A5' },
      { range: '0% to 20%', count: 0, color: '#86EFAC' },
      { range: '20% to 100%', count: 0, color: '#4ADE80' },
      { range: '> 100%', count: 0, color: COLORS.profit },
    ];
    
    for (const trade of closedTrades) {
      const pct = trade.pnlPercent;
      if (pct < -50) bins[0].count++;
      else if (pct < -20) bins[1].count++;
      else if (pct < 0) bins[2].count++;
      else if (pct < 20) bins[3].count++;
      else if (pct < 100) bins[4].count++;
      else bins[5].count++;
    }
    
    return bins;
  }, [closedTrades]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <span className="ml-3 text-gray-400">Loading P&L data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <PieChart className="w-6 h-6 text-emerald-500" />
          P&L Analytics
        </h1>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* View Mode Tabs */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            {(['overview', 'positions', 'history'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-emerald-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Timeframe Filter */}
          <div className="flex gap-1">
            {(['24h', '7d', '30d', 'All'] as TimeframeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          
          {/* Actions */}
          <button
            onClick={() => refreshPrices()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button
            onClick={() => {
              if (confirm('Clear all P&L data? This cannot be undone.')) {
                clearPnLData();
              }
            }}
            className="p-1.5 bg-gray-700 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-gray-400 transition-colors"
            title="Clear P&L data"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* No Data State */}
      {positions.length === 0 && closedTrades.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No P&L data recorded yet.</p>
          <p className="text-sm text-gray-500">
            Complete trades to see your analytics here.
          </p>
        </div>
      )}

      {/* Overview View */}
      {viewMode === 'overview' && (positions.length > 0 || closedTrades.length > 0) && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`rounded-lg p-6 border ${
              stats.totalPnL >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {stats.totalPnL >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                )}
                <span className={`text-sm ${stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Total P&L
                </span>
              </div>
              <div className={`text-3xl font-bold ${
                stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(6)} SOL
              </div>
              <div className={`text-sm mt-1 ${
                stats.totalPnL >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'
              }`}>
                {stats.totalSolSpent > 0 
                  ? `${stats.totalPnL >= 0 ? '+' : ''}${((stats.totalPnL / stats.totalSolSpent) * 100).toFixed(1)}% ROI`
                  : '—'
                }
              </div>
            </div>

            <div className="bg-blue-500/10 rounded-lg p-6 border border-blue-500/30">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-blue-400">Realized P&L</span>
              </div>
              <div className={`text-3xl font-bold ${
                stats.totalRealizedPnL >= 0 ? 'text-blue-400' : 'text-red-400'
              }`}>
                {stats.totalRealizedPnL >= 0 ? '+' : ''}{stats.totalRealizedPnL.toFixed(6)} SOL
              </div>
              <div className="text-sm text-blue-500/70 mt-1">
                {closedTrades.length} closed trade{closedTrades.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="bg-purple-500/10 rounded-lg p-6 border border-purple-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <span className="text-sm text-purple-400">Unrealized P&L</span>
              </div>
              <div className={`text-3xl font-bold ${
                stats.totalUnrealizedPnL >= 0 ? 'text-purple-400' : 'text-red-400'
              }`}>
                {stats.totalUnrealizedPnL >= 0 ? '+' : ''}{stats.totalUnrealizedPnL.toFixed(6)} SOL
              </div>
              <div className="text-sm text-purple-500/70 mt-1">
                {openPositions.length} open position{openPositions.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-gray-400">Win Rate</span>
              </div>
              <div className={`text-2xl font-bold ${
                stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {stats.winRate.toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-400">Wins</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{stats.winCount}</div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-400">Losses</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{stats.lossCount}</div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-400">SOL Spent</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {stats.totalSolSpent.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-400">Avg Win</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                +{stats.avgWinSol.toFixed(4)}
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                <span className="text-xs text-gray-400">Profit Factor</span>
              </div>
              <div className={`text-2xl font-bold ${
                stats.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Best/Worst Trades */}
          {(stats.bestTrade || stats.worstTrade) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.bestTrade && (
                <TradeResultCard trade={stats.bestTrade} type="best" />
              )}
              {stats.worstTrade && stats.worstTrade !== stats.bestTrade && (
                <TradeResultCard trade={stats.worstTrade} type="worst" />
              )}
            </div>
          )}

          {/* Portfolio Value Chart */}
          {filteredHistory.length > 1 && (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Portfolio Value Over Time
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredHistory}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#6B7280" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#6B7280" 
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(value) => `${value.toFixed(2)}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="totalValueSol"
                      name="Portfolio Value"
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Win/Loss Pie Chart & Distribution */}
          {(stats.winCount > 0 || stats.lossCount > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Win/Loss Ratio */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">Win/Loss Ratio</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={winLossData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {winLossData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* P&L Distribution */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">P&L Distribution</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pnlDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="range" 
                        stroke="#6B7280" 
                        fontSize={10}
                        tickLine={false}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        stroke="#6B7280" 
                        fontSize={12}
                        tickLine={false}
                      />
                      <Tooltip />
                      <Bar dataKey="count" name="Trades">
                        {pnlDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Positions View */}
      {viewMode === 'positions' && (
        <div className="space-y-4">
          {/* Open Positions */}
          {openPositions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Open Positions ({openPositions.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {openPositions.map((position) => (
                  <TokenPnLCard key={position.tokenMint} position={position} />
                ))}
              </div>
            </div>
          )}
          
          {/* All Positions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              All Tokens ({positions.length})
            </h2>
            {positions.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                <Wallet className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500">No positions recorded yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {positions
                  .sort((a, b) => b.totalPnLSol - a.totalPnLSol)
                  .map((position) => (
                    <TokenPnLCard key={position.tokenMint} position={position} />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History View */}
      {viewMode === 'history' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Closed Trades ({closedTrades.length})
          </h2>
          
          {closedTrades.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
              <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500">No closed trades yet.</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left text-xs text-gray-400 font-medium p-4">Token</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">SOL Spent</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">SOL Received</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">P&L</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">%</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">Hold Time</th>
                      <th className="text-right text-xs text-gray-400 font-medium p-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedTrades
                      .sort((a, b) => b.closedAt - a.closedAt)
                      .map((trade, idx) => (
                        <tr 
                          key={`${trade.tokenMint}-${trade.closedAt}-${idx}`}
                          className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {trade.isWin ? (
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              ) : (
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                              )}
                              <span className="text-white font-medium">
                                {trade.tokenSymbol || trade.tokenMint.slice(0, 8)}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-right text-gray-300 font-mono text-sm">
                            {trade.solSpent.toFixed(4)}
                          </td>
                          <td className="p-4 text-right text-gray-300 font-mono text-sm">
                            {trade.solReceived.toFixed(4)}
                          </td>
                          <td className={`p-4 text-right font-mono text-sm font-medium ${
                            trade.pnlSol >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)}
                          </td>
                          <td className={`p-4 text-right font-mono text-sm ${
                            trade.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
                          </td>
                          <td className="p-4 text-right text-gray-400 text-sm">
                            {formatDuration(trade.holdTimeMs)}
                          </td>
                          <td className="p-4 text-right text-gray-400 text-sm">
                            {new Date(trade.closedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Update Indicator */}
      {refreshing && (
        <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-2 shadow-xl">
          <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
          <span className="text-sm text-gray-400">Updating prices...</span>
        </div>
      )}
    </div>
  );
}
