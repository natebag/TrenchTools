import {
  Wallet,
  Bot,
  AlertTriangle,
  Zap,
  Activity,
  ArrowRight,
  Target,
  Volume2,
  Eye,
  ExternalLink,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  Server
} from 'lucide-react'
import { QuickSwap } from './QuickSwap'
import { PortfolioHoldings } from './PortfolioHoldings'
import { useSecureWallet } from '@/hooks/useSecureWallet'
import { useWallet } from '@/context/WalletContext'
import { useNetwork } from '@/context/NetworkContext'
import { useState, useEffect, useCallback } from 'react'
import { Connection } from '@solana/web3.js'

function getTypeColor(type: string) {
  switch (type) {
    case 'buy':
      return 'text-emerald-400'
    case 'sell':
      return 'text-red-400'
    case 'fund':
      return 'text-blue-400'
    case 'scan':
      return 'text-purple-400'
    case 'error':
      return 'text-red-400'
    default:
      return 'text-slate-400'
  }
}

function timeAgo(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function navigateTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Portfolio Overview Card - REAL DATA
function PortfolioCard() {
  const { rpcUrl } = useNetwork()
  const { wallets, isLocked } = useSecureWallet({ rpcUrl })

  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0)
  const walletCount = wallets.length

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
          onClick={() => navigateTo('/wallets')}
          className="text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="mb-4">
        {isLocked ? (
          <div className="flex items-center gap-2 text-amber-400">
            <Lock className="w-5 h-5" />
            <span className="text-lg">Vault locked</span>
          </div>
        ) : (
          <>
            <p className="text-3xl font-bold text-white glow-text">
              {totalBalance.toFixed(4)} <span className="text-lg text-slate-400">SOL</span>
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {walletCount} wallet{walletCount !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>

      {!isLocked && walletCount > 0 && (
        <div className="p-2 rounded-lg bg-slate-800/50 text-center">
          <p className="text-lg font-bold text-emerald-400">{walletCount}</p>
          <p className="text-xs text-slate-500">Total Wallets</p>
        </div>
      )}
    </div>
  )
}

// Active Bots Card - placeholder until bots have real state
function ActiveBotsCard() {
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

      <div className="text-center py-4">
        <p className="text-2xl font-bold text-slate-500">0</p>
        <p className="text-xs text-slate-500 mt-1">No bots running</p>
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

      <div className="text-center py-6">
        <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No recent alerts</p>
        <p className="text-xs text-slate-600 mt-1">Run detection scans to see alerts</p>
      </div>

      <button
        onClick={() => navigateTo('/detection')}
        className="btn-secondary w-full mt-4 text-sm"
      >
        <Eye className="w-4 h-4" />
        Run Detection
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
          <span className="text-sm text-slate-300">Market Making</span>
        </button>
      </div>
    </div>
  )
}

// System Status Card - REAL DATA
function SystemStatusCard() {
  const { rpcUrl, network } = useNetwork()
  const { isLocked, hasVault, wallets } = useSecureWallet({ rpcUrl })
  const [rpcConnected, setRpcConnected] = useState(false)

  const checkRpc = useCallback(async () => {
    try {
      const connection = new Connection(rpcUrl, 'confirmed')
      await connection.getSlot()
      setRpcConnected(true)
    } catch {
      setRpcConnected(false)
    }
  }, [rpcUrl])

  useEffect(() => {
    checkRpc()
    const interval = setInterval(checkRpc, 30000)
    return () => clearInterval(interval)
  }, [checkRpc])

  const vaultStatus = !hasVault ? 'none' : isLocked ? 'locked' : 'unlocked'

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
            <span className="text-sm text-slate-300">RPC</span>
          </div>
          <span className={`badge ${rpcConnected ? 'badge-success' : 'badge-error'}`}>
            {rpcConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
          <div className="flex items-center gap-3">
            {vaultStatus === 'unlocked' ? (
              <Unlock className="w-5 h-5 text-emerald-400" />
            ) : (
              <Lock className={`w-5 h-5 ${vaultStatus === 'locked' ? 'text-amber-400' : 'text-slate-500'}`} />
            )}
            <span className="text-sm text-slate-300">Vault</span>
          </div>
          <span className={`badge ${
            vaultStatus === 'unlocked' ? 'badge-success' :
            vaultStatus === 'locked' ? 'badge-warning' : 'badge-neutral'
          }`}>
            {vaultStatus === 'unlocked' ? `${wallets.length} wallets` :
             vaultStatus === 'locked' ? 'Locked' : 'No vault'}
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

// Recent Activity Feed - REAL DATA from WalletContext
function RecentActivityCard() {
  const { activity } = useWallet()
  const recentLogs = activity.slice(0, 10)

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
          {recentLogs.length > 0 ? `${recentLogs.length} entries` : 'No activity yet'}
        </span>
      </div>

      {recentLogs.length === 0 ? (
        <div className="text-center py-8">
          <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No activity recorded yet</p>
          <p className="text-xs text-slate-600 mt-1">Activity will appear as you use the app</p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 text-sm text-slate-400">{timeAgo(log.timestamp)}</td>
                  <td className="py-3">
                    <span className={`text-sm font-medium uppercase ${getTypeColor(log.type)}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-slate-300 max-w-xs truncate">{log.description}</td>
                  <td className="py-3 text-sm text-white font-medium">
                    {log.amount ? `${log.amount} SOL` : '-'}
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
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">Welcome back to TrenchSniper OS</p>
        </div>
      </div>

      {/* Widget Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PortfolioCard />
        <QuickSwap />
        <RecentAlertsCard />
        <ActiveBotsCard />
        <SystemStatusCard />
        <QuickActionsCard />
        <RecentActivityCard />

        <div className="lg:col-span-3">
          <PortfolioHoldings />
        </div>
      </div>
    </div>
  )
}

export default Dashboard
