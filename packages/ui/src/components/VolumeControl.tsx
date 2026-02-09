import { useState } from 'react'
import { 
  Volume2, 
  TrendingUp, 
  Activity,
  Sliders,
  Play,
  Pause,
  BarChart3,
  Wallet,
  AlertCircle
} from 'lucide-react'

// Types for Volume Boosting configuration
interface VolumeConfig {
  enabled: boolean
  targetToken: string
  intensity: 'low' | 'medium' | 'high' | 'aggressive'
  pattern: 'organic' | 'steady' | 'burst' | 'wave'
  dailyTargetSol: number
  maxWallets: number
  minSwapSol: number
  maxSwapSol: number
  minIntervalMs: number
  maxIntervalMs: number
}

interface VolumeStats {
  totalVolume24h: number
  currentRate: number // SOL per hour
  activeWallets: number
  swapsExecuted: number
  successRate: number
}

// Mock data
const defaultConfig: VolumeConfig = {
  enabled: false,
  targetToken: '',
  intensity: 'medium',
  pattern: 'organic',
  dailyTargetSol: 50,
  maxWallets: 10,
  minSwapSol: 0.01,
  maxSwapSol: 0.1,
  minIntervalMs: 30000,
  maxIntervalMs: 120000,
}

const mockStats: VolumeStats = {
  totalVolume24h: 42.5,
  currentRate: 2.3,
  activeWallets: 8,
  swapsExecuted: 512,
  successRate: 96.5,
}

const intensityConfigs = {
  low: { minSwap: 0.005, maxSwap: 0.02, minInterval: 120000, maxInterval: 300000 },
  medium: { minSwap: 0.01, maxSwap: 0.1, minInterval: 30000, maxInterval: 120000 },
  high: { minSwap: 0.05, maxSwap: 0.2, minInterval: 15000, maxInterval: 60000 },
  aggressive: { minSwap: 0.1, maxSwap: 0.5, minInterval: 5000, maxInterval: 30000 },
}

const patternDescriptions = {
  organic: 'Natural-looking volume with varied timing and sizes',
  steady: 'Consistent volume throughout the day',
  burst: 'Concentrated bursts of activity with quiet periods',
  wave: 'Gradual increases and decreases in activity',
}

function IntensitySelector({ value, onChange }: { 
  value: VolumeConfig['intensity']
  onChange: (v: VolumeConfig['intensity']) => void 
}) {
  const levels: VolumeConfig['intensity'][] = ['low', 'medium', 'high', 'aggressive']
  
  return (
    <div className="space-y-3">
      <label className="text-sm text-slate-400">Intensity Level</label>
      <div className="grid grid-cols-4 gap-2">
        {levels.map(level => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
              value === level
                ? level === 'aggressive'
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {value === 'low' && 'Subtle volume - 0.005-0.02 SOL swaps, 2-5 min intervals'}
        {value === 'medium' && 'Moderate volume - 0.01-0.1 SOL swaps, 30s-2 min intervals'}
        {value === 'high' && 'High volume - 0.05-0.2 SOL swaps, 15-60s intervals'}
        {value === 'aggressive' && '⚠️ Very high volume - 0.1-0.5 SOL swaps, 5-30s intervals'}
      </p>
    </div>
  )
}

function PatternSelector({ value, onChange }: {
  value: VolumeConfig['pattern']
  onChange: (v: VolumeConfig['pattern']) => void
}) {
  const patterns: VolumeConfig['pattern'][] = ['organic', 'steady', 'burst', 'wave']
  
  return (
    <div className="space-y-3">
      <label className="text-sm text-slate-400">Trading Pattern</label>
      <div className="grid grid-cols-2 gap-2">
        {patterns.map(pattern => (
          <button
            key={pattern}
            onClick={() => onChange(pattern)}
            className={`py-3 px-4 rounded-lg border text-left transition-colors ${
              value === pattern
                ? 'bg-emerald-500/20 border-emerald-500'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
          >
            <span className={`font-medium ${value === pattern ? 'text-emerald-400' : 'text-white'}`}>
              {pattern.charAt(0).toUpperCase() + pattern.slice(1)}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              {patternDescriptions[pattern]}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon, color }: {
  label: string
  value: string | number
  unit?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">
            {value}
            {unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
          </p>
          <p className="text-sm text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

export function VolumeControl() {
  const [config, setConfig] = useState<VolumeConfig>(defaultConfig)
  const [stats] = useState<VolumeStats>(mockStats)
  const [isRunning, setIsRunning] = useState(false)
  
  const updateConfig = (updates: Partial<VolumeConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }
  
  const handleIntensityChange = (intensity: VolumeConfig['intensity']) => {
    const presets = intensityConfigs[intensity]
    updateConfig({
      intensity,
      minSwapSol: presets.minSwap,
      maxSwapSol: presets.maxSwap,
      minIntervalMs: presets.minInterval,
      maxIntervalMs: presets.maxInterval,
    })
  }
  
  const handleToggle = () => {
    setIsRunning(!isRunning)
    updateConfig({ enabled: !isRunning })
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Volume Control</h2>
          <p className="text-slate-400 mt-1">Configure volume boosting for your token</p>
        </div>
        <button
          onClick={handleToggle}
          className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${
            isRunning
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          }`}
        >
          {isRunning ? (
            <>
              <Pause className="w-4 h-4" />
              Stop Boosting
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Boosting
            </>
          )}
        </button>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="24h Volume"
          value={stats.totalVolume24h.toFixed(1)}
          unit="SOL"
          icon={Volume2}
          color="bg-purple-500/20 text-purple-400"
        />
        <StatCard
          label="Current Rate"
          value={stats.currentRate.toFixed(1)}
          unit="SOL/hr"
          icon={TrendingUp}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          label="Active Wallets"
          value={stats.activeWallets}
          icon={Wallet}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          label="Swaps Executed"
          value={stats.swapsExecuted}
          icon={Activity}
          color="bg-yellow-500/20 text-yellow-400"
        />
        <StatCard
          label="Success Rate"
          value={stats.successRate.toFixed(1)}
          unit="%"
          icon={BarChart3}
          color="bg-slate-500/20 text-slate-400"
        />
      </div>
      
      {/* Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Settings */}
        <div className="card space-y-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            Volume Settings
          </h3>
          
          {/* Target Token */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Target Token Mint</label>
            <input
              type="text"
              value={config.targetToken}
              onChange={(e) => updateConfig({ targetToken: e.target.value })}
              placeholder="Enter token mint address..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
          
          {/* Daily Target */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Daily Volume Target (SOL)</label>
            <input
              type="number"
              value={config.dailyTargetSol}
              onChange={(e) => updateConfig({ dailyTargetSol: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          
          {/* Max Wallets */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Max Wallets to Use</label>
            <input
              type="number"
              value={config.maxWallets}
              onChange={(e) => updateConfig({ maxWallets: parseInt(e.target.value) || 1 })}
              min={1}
              max={100}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          
          {/* Intensity */}
          <IntensitySelector
            value={config.intensity}
            onChange={handleIntensityChange}
          />
        </div>
        
        {/* Pattern & Advanced */}
        <div className="card space-y-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Trading Pattern
          </h3>
          
          <PatternSelector
            value={config.pattern}
            onChange={(pattern) => updateConfig({ pattern })}
          />
          
          {/* Manual Overrides */}
          <div className="pt-4 border-t border-slate-700/50">
            <h4 className="text-sm font-medium text-white mb-4">Advanced Settings</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Min Swap (SOL)</label>
                <input
                  type="number"
                  value={config.minSwapSol}
                  onChange={(e) => updateConfig({ minSwapSol: parseFloat(e.target.value) || 0 })}
                  step={0.001}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Max Swap (SOL)</label>
                <input
                  type="number"
                  value={config.maxSwapSol}
                  onChange={(e) => updateConfig({ maxSwapSol: parseFloat(e.target.value) || 0 })}
                  step={0.01}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Min Interval (sec)</label>
                <input
                  type="number"
                  value={config.minIntervalMs / 1000}
                  onChange={(e) => updateConfig({ minIntervalMs: (parseFloat(e.target.value) || 0) * 1000 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Max Interval (sec)</label>
                <input
                  type="number"
                  value={config.maxIntervalMs / 1000}
                  onChange={(e) => updateConfig({ maxIntervalMs: (parseFloat(e.target.value) || 0) * 1000 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
          
          {/* Warning for aggressive mode */}
          {config.intensity === 'aggressive' && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">Aggressive Mode Warning</p>
                <p className="text-xs text-slate-400 mt-1">
                  High-frequency trading may trigger detection systems and could result in wallet flagging.
                  Use with caution.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VolumeControl
