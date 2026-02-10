import { 
  Wallet, 
  Bot, 
  AlertTriangle, 
  Zap, 
  Activity,
  TrendingUp,
  TrendingDown,
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
  Server
} from 'lucide-react'

// Mock data for demonstration
const portfolioData = {
  totalValue: 125.42,
  change24h: 12.35,
  changePercent: 10.92,
  isPositive: true,
}

const botsData = {
  activeCount: 3,
  totalVolumeToday: 45.67,
  successRate: 94.5,
}

const alertsData = [
  { id: 1, message: 'Whale accumulation detected on BONK', severity: 'HIGH', time: '2m ago' },
  { id: 2, message: 'Unusual volume spike on WIF', severity: 'MEDIUM', time: '15m ago' },
  { id: 3, message: 'New token launch detected', severity: 'LOW', time: '32m ago' },
  { id: 4, message: 'Rug pull pattern identified', severity: 'HIGH', time: '1h ago' },
  { id: 5, message: 'Liquidity removal warning', severity: 'MEDIUM', time: '2h ago' },
]

const systemStatus = {
  rpcConnected: true,
  walletVaultStatus: 'locked',
  network: 'devnet',
}

const recentActivity = [
  { id: 1, type: 'SWAP', amount: '0.5 SOL', status: 'success', time: '1m ago', token: 'BONK' },
  { id: 2, type: 'SNIPE', amount: '2.0 SOL', status: 'success', time: '5m ago', token: 'WIF' },
  { id: 3, type: 'SWAP', amount: '0.3 SOL', status: 'failed', time: '12m ago', token: 'JUP' },
  { id: 4, type: 'VOLUME', amount: '1.5 SOL', status: 'success', time: '18m ago', token: 'POPCAT' },
  { id: 5, type: 'SWAP', amount: '0.8 SOL', status: 'success', time: '25m ago', token: 'MYRO' },
  { id: 6, type: 'SNIPE', amount: '1.0 SOL', status: 'pending', time: '32m ago', token: 'BOOK' },
  { id: 7, type: 'SWAP', amount: '0.2 SOL', status: 'success', time: '45m ago', token: 'MEW' },
  { id: 8, type: 'VOLUME', amount: '3.0 SOL', status: 'success', time: '1h ago', token: 'SLERF' },
  { id: 9, type: 'SWAP', amount: '0.4 SOL', status: 'failed', time: '1h ago', token: 'WEN' },
  { id: 10, type: 'SNIPE', amount: '1.2 SOL', status: 'success', time: '2h ago', token: 'BOME' },
]

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'HIGH':
      return 'badge-error'
    case 'MEDIUM':
      return 'badge-warning'
    case 'LOW':
      return 'badge-neutral'
    default:
      return 'badge-neutral'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':
      return <CheckCircle className="w-4 h-4 text-emerald-400" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />
    case 'pending':
      return <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />
    default:
      return <Activity className="w-4 h-4 text-slate-400" />
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'SWAP':
      return 'text-blue-400'
    case 'SNIPE':
      return 'text-emerald-400'
    case 'VOLUME':
      return 'text-purple-400'
    default:
      return 'text-slate-400'
  }
}

function SparklineChart() {
  // Simple SVG sparkline placeholder
  const points = [20, 35, 28, 45, 32, 55, 48, 62, 58, 72, 65, 80]
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min
  
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

// Portfolio Overview Card
function PortfolioCard() {
  const { totalValue, change24h, changePercent, isPositive } = portfolioData
  
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-emerald-400" />
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
          {totalValue.toFixed(2)} <span className="text-lg text-slate-400">SOL</span>
        </p>
        <div className={`flex items-center gap-2 mt-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span className="font-medium">
            {isPositive ? '+' : ''}{change24h.toFixed(2)} SOL ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
          </span>
          <span className="text-xs text-slate-500">24h</span>
        </div>
      </div>
      
      <SparklineChart />
    </div>
  )
}

// Active Bots Card
function ActiveBotsCard() {
  const { activeCount, totalVolumeToday, successRate } = botsData
  
  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="font-semibold text-white">Active Bots</h3>
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
          <p className="text-2xl font-bold text-white">{activeCount}</p>
          <p className="text-xs text-slate-400">Running</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{totalVolumeToday.toFixed(1)}</p>
          <p className="text-xs text-slate-400">Vol (SOL)</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-400">{successRate}%</p>
          <p className="text-xs text-slate-400">Success</p>
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

// Recent Alerts Card
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
      
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {alertsData.map((alert) => (
          <div 
            key={alert.id}
            className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
            onClick={() => navigateTo('/detection')}
          >
            <span className={`badge ${getSeverityBadge(alert.severity)} flex-shrink-0`}>
              {alert.severity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300 truncate">{alert.message}</p>
              <p className="text-xs text-slate-500">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>
      
      <button 
        onClick={() => navigateTo('/detection')}
        className="btn-secondary w-full mt-4 text-sm"
      >
        <Eye className="w-4 h-4" />
        View All Alerts
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

// System Status Card
function SystemStatusCard() {
  const { rpcConnected, walletVaultStatus, network } = systemStatus
  
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
            {rpcConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-3">
            <Lock className={`w-5 h-5 ${walletVaultStatus === 'locked' ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span className="text-sm text-slate-300">Wallet Vault</span>
          </div>
          <span className={`badge ${walletVaultStatus === 'locked' ? 'badge-warning' : 'badge-success'}`}>
            {walletVaultStatus === 'locked' ? 'Locked' : 'Unlocked'}
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

// Recent Activity Feed
function RecentActivityCard() {
  return (
    <div className="card hover:border-slate-700 transition-colors lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="font-semibold text-white">Recent Activity</h3>
        </div>
        <span className="text-xs text-slate-500">Last 10 transactions</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left border-b border-slate-700/50">
              <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
              <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
              <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Token</th>
              <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {recentActivity.map((activity) => (
              <tr key={activity.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3 text-sm text-slate-400">{activity.time}</td>
                <td className="py-3">
                  <span className={`text-sm font-medium ${getTypeColor(activity.type)}`}>
                    {activity.type}
                  </span>
                </td>
                <td className="py-3 text-sm text-slate-300 font-mono">{activity.token}</td>
                <td className="py-3 text-sm text-white font-medium">{activity.amount}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(activity.status)}
                    <span className={`text-sm capitalize ${
                      activity.status === 'success' ? 'text-emerald-400' :
                      activity.status === 'failed' ? 'text-red-400' :
                      'text-yellow-400'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">Welcome back to TrenchSniper OS</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm text-slate-300">All Systems Operational</span>
        </div>
      </div>
      
      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Portfolio Overview */}
        <PortfolioCard />
        
        {/* Active Bots */}
        <ActiveBotsCard />
        
        {/* Recent Alerts */}
        <RecentAlertsCard />
        
        {/* Quick Actions */}
        <QuickActionsCard />
        
        {/* System Status */}
        <SystemStatusCard />
        
        {/* Recent Activity - spans 2 columns on large screens */}
        <RecentActivityCard />
      </div>
    </div>
  )
}

export default Dashboard
