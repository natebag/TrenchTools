import { useState } from 'react'
import { 
  Bot, 
  Play, 
  Pause, 
  Square, 
  Plus, 
  Trash2, 
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'

// Types for Orchestrator integration
interface BotSnapshot {
  id: string
  walletPublicKey: string
  state: 'idle' | 'starting' | 'running' | 'paused' | 'stopping' | 'stopped' | 'error'
  config: {
    targetToken: string
    direction: 'buy' | 'sell' | 'both'
    minSwapSol: number
    maxSwapSol: number
    minIntervalMs: number
    maxIntervalMs: number
  }
  stats: {
    swapsAttempted: number
    swapsSuccessful: number
    swapsFailed: number
    totalVolumeSol: number
    lastSwapAt: number | null
  }
  createdAt: number
}

interface OrchestratorStats {
  totalBots: number
  activeBots: number
  pausedBots: number
  stoppedBots: number
  errorBots: number
  totalSwapsExecuted: number
  totalVolumeSol: number
  uptime: number
}

// Mock data for UI demonstration
const mockBots: BotSnapshot[] = [
  {
    id: 'bot-001',
    walletPublicKey: '7xKX...3nFd',
    state: 'running',
    config: {
      targetToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      direction: 'both',
      minSwapSol: 0.01,
      maxSwapSol: 0.1,
      minIntervalMs: 30000,
      maxIntervalMs: 120000,
    },
    stats: {
      swapsAttempted: 156,
      swapsSuccessful: 148,
      swapsFailed: 8,
      totalVolumeSol: 12.45,
      lastSwapAt: Date.now() - 45000,
    },
    createdAt: Date.now() - 3600000,
  },
  {
    id: 'bot-002',
    walletPublicKey: '9pQm...7kLe',
    state: 'paused',
    config: {
      targetToken: 'So11111111111111111111111111111111111111112',
      direction: 'buy',
      minSwapSol: 0.05,
      maxSwapSol: 0.2,
      minIntervalMs: 60000,
      maxIntervalMs: 180000,
    },
    stats: {
      swapsAttempted: 89,
      swapsSuccessful: 85,
      swapsFailed: 4,
      totalVolumeSol: 8.32,
      lastSwapAt: Date.now() - 900000,
    },
    createdAt: Date.now() - 7200000,
  },
  {
    id: 'bot-003',
    walletPublicKey: '3mNx...9wTp',
    state: 'error',
    config: {
      targetToken: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      direction: 'sell',
      minSwapSol: 0.02,
      maxSwapSol: 0.08,
      minIntervalMs: 45000,
      maxIntervalMs: 90000,
    },
    stats: {
      swapsAttempted: 45,
      swapsSuccessful: 32,
      swapsFailed: 13,
      totalVolumeSol: 2.18,
      lastSwapAt: Date.now() - 1800000,
    },
    createdAt: Date.now() - 5400000,
  },
]

const mockStats: OrchestratorStats = {
  totalBots: 3,
  activeBots: 1,
  pausedBots: 1,
  stoppedBots: 0,
  errorBots: 1,
  totalSwapsExecuted: 265,
  totalVolumeSol: 22.95,
  uptime: 10800,
}

function getStateColor(state: BotSnapshot['state']): string {
  switch (state) {
    case 'running': return 'text-emerald-400'
    case 'paused': return 'text-yellow-400'
    case 'error': return 'text-red-400'
    case 'stopped': return 'text-slate-400'
    default: return 'text-slate-500'
  }
}

function getStateBgColor(state: BotSnapshot['state']): string {
  switch (state) {
    case 'running': return 'bg-emerald-500/20'
    case 'paused': return 'bg-yellow-500/20'
    case 'error': return 'bg-red-500/20'
    case 'stopped': return 'bg-slate-500/20'
    default: return 'bg-slate-500/20'
  }
}

function getStateIcon(state: BotSnapshot['state']) {
  switch (state) {
    case 'running': return <Activity className="w-4 h-4 animate-pulse" />
    case 'paused': return <Pause className="w-4 h-4" />
    case 'error': return <AlertCircle className="w-4 h-4" />
    case 'stopped': return <Square className="w-4 h-4" />
    default: return <Clock className="w-4 h-4" />
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function BotCard({ bot, onStart, onPause, onStop, onRemove }: {
  bot: BotSnapshot
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onRemove: () => void
}) {
  const successRate = bot.stats.swapsAttempted > 0 
    ? ((bot.stats.swapsSuccessful / bot.stats.swapsAttempted) * 100).toFixed(1) 
    : '0.0'
  
  const lastSwapAgo = bot.stats.lastSwapAt 
    ? formatDuration(Date.now() - bot.stats.lastSwapAt)
    : 'Never'
  
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${getStateBgColor(bot.state)} flex items-center justify-center`}>
            <Bot className={`w-5 h-5 ${getStateColor(bot.state)}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{bot.id}</h3>
            <p className="text-sm text-slate-400">{bot.walletPublicKey}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${getStateBgColor(bot.state)}`}>
          {getStateIcon(bot.state)}
          <span className={`text-sm capitalize ${getStateColor(bot.state)}`}>{bot.state}</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Success Rate</p>
          <p className="text-lg font-semibold text-white">{successRate}%</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Volume</p>
          <p className="text-lg font-semibold text-white">{bot.stats.totalVolumeSol.toFixed(2)} SOL</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Swaps</p>
          <p className="text-lg font-semibold text-white">
            {bot.stats.swapsSuccessful}
            <span className="text-sm text-slate-400">/{bot.stats.swapsAttempted}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Last Swap</p>
          <p className="text-lg font-semibold text-white">{lastSwapAgo}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
        {bot.state === 'running' && (
          <button onClick={onPause} className="btn-secondary flex-1 text-sm py-1.5">
            <Pause className="w-4 h-4" />
            Pause
          </button>
        )}
        {(bot.state === 'paused' || bot.state === 'error' || bot.state === 'idle') && (
          <button onClick={onStart} className="btn-primary flex-1 text-sm py-1.5">
            <Play className="w-4 h-4" />
            Start
          </button>
        )}
        {bot.state !== 'stopped' && (
          <button onClick={onStop} className="btn-secondary text-sm py-1.5 px-3">
            <Square className="w-4 h-4" />
          </button>
        )}
        {bot.state === 'stopped' && (
          <button onClick={onRemove} className="btn-danger flex-1 text-sm py-1.5">
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

export function BotManager() {
  const [bots, setBots] = useState<BotSnapshot[]>(mockBots)
  const [stats] = useState<OrchestratorStats>(mockStats)
  const [, setShowNewBotModal] = useState(false)
  
  const handleStart = (botId: string) => {
    setBots(prev => prev.map(b => 
      b.id === botId ? { ...b, state: 'running' as const } : b
    ))
  }
  
  const handlePause = (botId: string) => {
    setBots(prev => prev.map(b => 
      b.id === botId ? { ...b, state: 'paused' as const } : b
    ))
  }
  
  const handleStop = (botId: string) => {
    setBots(prev => prev.map(b => 
      b.id === botId ? { ...b, state: 'stopped' as const } : b
    ))
  }
  
  const handleRemove = (botId: string) => {
    setBots(prev => prev.filter(b => b.id !== botId))
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Bot Manager</h2>
          <p className="text-slate-400 mt-1">Manage market making bots</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button 
            className="btn-primary"
            onClick={() => setShowNewBotModal(true)}
          >
            <Plus className="w-4 h-4" />
            New Bot
          </button>
        </div>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.activeBots}</p>
              <p className="text-sm text-slate-400">Active Bots</p>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalSwapsExecuted}</p>
              <p className="text-sm text-slate-400">Total Swaps</p>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalVolumeSol.toFixed(2)}</p>
              <p className="text-sm text-slate-400">Volume (SOL)</p>
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{formatDuration(stats.uptime * 1000)}</p>
              <p className="text-sm text-slate-400">Uptime</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bot List */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Active Bots</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              onStart={() => handleStart(bot.id)}
              onPause={() => handlePause(bot.id)}
              onStop={() => handleStop(bot.id)}
              onRemove={() => handleRemove(bot.id)}
            />
          ))}
          
          {bots.length === 0 && (
            <div className="col-span-full card flex flex-col items-center justify-center py-12">
              <Bot className="w-12 h-12 text-slate-600 mb-4" />
              <p className="text-slate-400 text-center">No bots configured</p>
              <button 
                className="btn-primary mt-4"
                onClick={() => setShowNewBotModal(true)}
              >
                <Plus className="w-4 h-4" />
                Create First Bot
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BotManager
