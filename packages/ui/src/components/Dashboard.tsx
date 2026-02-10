import { useMemo } from 'react'
import { 
  Wallet as WalletIcon, 
  Bot, 
  AlertTriangle, 
  Zap, 
  Activity,
  ArrowRight,
  Target,
  Volume2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Wifi,
  WifiOff,
  Lock,
  Server,
  Inbox
} from 'lucide-react'
import { useWallet } from '../context/WalletContext'
import { ActivityLog } from '../types'

// Helper to format time ago
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
    case 'buy':
    case 'sell':
    case 'fund':
      return <CheckCircle className="w-4 h-4 text-emerald-400" />
    case 'error':
      return <XCircle className="w-4 h-4 text-red-400" />
    case 'pending':
      return <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />
    default:
      return <Activity className="w-4 h-4 text-slate-400" />
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'buy':
      return 'text-emerald-400'
    case 'sell':
      return 'text-blue-400'
    case 'fund':
      return 'text-purple-400'
    case 'scan':
      return 'text-cyan-400'
    case 'error':
      return 'text-red-400'
    default:
      return 'text-slate-400'
  }
}

function SparklineChart({ data }: { data: number[] }) {
  const points = data.length > 0 ? data : [50, 50] // flat line if no data
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  
  const pathData = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 100 - ((p - min) / range) * 100
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
  
  return (
    <svg viewBox="0 0 100 100" className="w-full h-16" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathData} L 100 100 L 0 100 Z`}
        fill="url(#sparklineGradient)"
      />
      <path
        d={pathData}
        fill="none"
        stroke="rgb(16, 185, 129)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function navigateTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Portfolio Overview Card - Uses real wallet data
function PortfolioCard({ totalValue, sparklineData }: { totalValue: number; sparklineData: number[] }) {
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <WalletIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="font-semibold text-white">Portfolio Overview</h3>
        </div>
        <button 
          onClick={() => navigateTo('/pnl')}
          className="text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
      
      <div className="mb-4">
        <p className="text-3xl font-bold text-white glow-text">
          {totalValue.toFixed(4)} <span className="text-lg text-slate-400">SOL</span>
        </p>
        {/* 24h change - will be enabled when historical tracking is added */}
        {totalValue === 0 && (
          <p className="text-sm text-slate-500 mt-1">Add wallets to see your balance</p>
        )}
      </div>
      
      <SparklineChart data={sparklineData} />
    </div>
  )
}

// Active Bots Card - Shows treasury stats for now
function ActiveBotsCard({ dailyVolume, totalProfit }: { dailyVolume: number; totalProfit: number }) {
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="font-semibold text-white">Bot Activity</h3>
        </div>
        <button 
          onClick={() => navigateTo('/bots')}
          className="text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-2xl font-bold text-white">0</p>
          <p className="text-xs text-slate-400">Running</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{dailyVolume.toFixed(2)}</p>
          <p className="text-xs text-slate-400">Vol (SOL)</p>
        </div>
        <div>
          <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
          </p>
          <p className="text-xs text-slate-400">Profit (SOL)</p>
        </div>
      </div>
      
      <button 
        onClick={() => navigateTo('/bots')}
        className="btn-secondary w-full mt-4 text-sm"
      >
        <Bot className="w-4 h-4" />
        Manage Bots
      </button>
    </div>
  )
}

// Recent Alerts Card - Empty state for now
function RecentAlertsCard() {
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="font-semibold text-white">Recent Alerts</h3>
        </div>
        <button 
          onClick={() => navigateTo('/detection')}
          className="text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
        <Inbox className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">No alerts yet</p>
        <p className="text-xs mt-1">Scan a token to start detection</p>
      </div>
      
      <button 
        onClick={() => navigateTo('/detection')}
        className="btn-secondary w-full mt-4 text-sm"
      >
        <Eye className="w-4 h-4" />
        Analyze Token
      </button>
    </div>
  )
}

// Quick Actions Card
function QuickActionsCard() {
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-blue-400" />
        </div>
        <h3 className="font-semibold text-white">Quick Actions</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => navigateTo('/bots')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
        >
          <Bot className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-slate-300">Start Bot</span>
        </button>
        
        <button 
          onClick={() => navigateTo('/detection')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
        >
          <Eye className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-slate-300">Analyze Token</span>
        </button>
        
        <button 
          onClick={() => navigateTo('/snipe')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
        >
          <Target className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-slate-300">Snipe Token</span>
        </button>
        
        <button 
          onClick={() => navigateTo('/volume')}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800 transition-all group"
        >
          <Volume2 className="w-6 h-6 text-slate-400 group-hover:text-emerald-400 transition-colors" />
          <span className="text-sm text-slate-300">Boost Volume</span>
        </button>
      </div>
    </div>
  )
}

// System Status Card - Uses real settings
function SystemStatusCard({ rpcUrl, walletCount }: { rpcUrl: string; walletCount: number }) {
  const rpcConnected = rpcUrl.length > 0
  const network = rpcUrl.includes('devnet') ? 'devnet' : rpcUrl.includes('mainnet') ? 'mainnet' : 'custom'
  const vaultStatus = walletCount > 0 ? 'unlocked' : 'empty'
  
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
          <Server className="w-5 h-5 text-slate-400" />
        </div>
        <h3 className="font-semibold text-white">System Status</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-3">
            {rpcConnected ? (
              <Wifi className="w-5 h-5 text-emerald-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
            <span className="text-sm text-slate-300">RPC Connection</span>
          </div>
          <span className={`badge ${rpcConnected ? 'badge-success' : 'badge-error'}`}>
            {rpcConnected ? 'Configured' : 'Not Set'}
          </span>
        </div>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-3">
            <Lock className={`w-5 h-5 ${vaultStatus === 'empty' ? 'text-slate-400' : 'text-emerald-400'}`} />
            <span className="text-sm text-slate-300">Wallet Vault</span>
          </div>
          <span className={`badge ${vaultStatus === 'empty' ? 'badge-neutral' : 'badge-success'}`}>
            {walletCount} wallet{walletCount !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-slate-300">Network</span>
          </div>
          <span className="badge badge-neutral capitalize">{network}</span>
        </div>
      </div>
    </div>
  )
}

// Recent Activity Feed - Uses real activity data
function RecentActivityCard({ activity }: { activity: ActivityLog[] }) {
  const recentActivity = activity.slice(0, 10)
  
  return (
    <div className="card hover:border-slate-700 transition-colors lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="font-semibold text-white">Recent Activity</h3>
        </div>
        <span className="text-xs text-slate-500">
          {recentActivity.length > 0 ? `Last ${recentActivity.length} transactions` : 'No activity yet'}
        </span>
      </div>
      
      {recentActivity.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Inbox className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No activity recorded yet</p>
          <p className="text-xs mt-1">Transactions will appear here</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-slate-700/50">
                <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
                <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {recentActivity.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 text-sm text-slate-400">{timeAgo(new Date(item.timestamp))}</td>
                  <td className="py-3">
                    <span className={`text-sm font-medium uppercase ${getTypeColor(item.type)}`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-slate-300 max-w-xs truncate">{item.description}</td>
                  <td className="py-3 text-sm text-white font-medium">
                    {item.amount ? `${item.amount.toFixed(4)} SOL` : '-'}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.type)}
                      <span className={`text-sm capitalize ${
                        item.type === 'error' ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {item.type === 'error' ? 'failed' : 'success'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const { wallets, treasury, activity, settings, loading } = useWallet()
  
  // Calculate portfolio total from all wallets
  const portfolioTotal = useMemo(() => {
    return wallets.reduce((sum, w) => sum + (w.balance || 0), 0)
  }, [wallets])
  
  // Generate sparkline data from wallet balances (for visual interest)
  const sparklineData = useMemo(() => {
    if (wallets.length === 0) return [0, 0]
    // Create some variation based on wallet data
    return wallets.map(w => w.balance || 0)
  }, [wallets])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">Welcome to TrenchSniper OS</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className={`w-2 h-2 rounded-full ${settings.rpcUrl ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-sm text-slate-300">
            {settings.rpcUrl ? 'Ready' : 'Configure RPC to start'}
          </span>
        </div>
      </div>
      
      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Portfolio Overview */}
        <PortfolioCard totalValue={portfolioTotal} sparklineData={sparklineData} />
        
        {/* Bot Activity */}
        <ActiveBotsCard 
          dailyVolume={treasury.dailyVolume} 
          totalProfit={treasury.totalProfit - treasury.totalLoss} 
        />
        
        {/* Recent Alerts */}
        <RecentAlertsCard />
        
        {/* Quick Actions */}
        <QuickActionsCard />
        
        {/* System Status */}
        <SystemStatusCard rpcUrl={settings.rpcUrl} walletCount={wallets.length} />
        
        {/* Recent Activity - spans 2 columns on large screens */}
        <RecentActivityCard activity={activity} />
      </div>
    </div>
  )
}

export default Dashboard
