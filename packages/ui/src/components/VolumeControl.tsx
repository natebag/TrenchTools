import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Volume2, 
  TrendingUp, 
  Activity,
  Sliders,
  Play,
  Pause,
  BarChart3,
  Wallet,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Key,
  ExternalLink,
  ChevronDown
} from 'lucide-react'
import { useSecureWallet } from '@/hooks/useSecureWallet'
import { useNetwork } from '@/context/NetworkContext'
import { useActiveTokens } from '@/context/ActiveTokensContext'
import { useTxHistory } from '@/context/TxHistoryContext'
import { 
  getSwapper, 
  getQuote, 
  executeSwap as dexExecuteSwap,
  DEX_INFO, 
  KNOWN_MINTS,
  type DexType, 
  type DexConfig 
} from '@/lib/dex'

// Types for Volume Boosting configuration
interface VolumeConfig {
  enabled: boolean
  targetToken: string
  selectedDex: DexType
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

const STORAGE_KEY = 'trench_volume_config';

// Default config
const defaultConfig: VolumeConfig = {
  enabled: false,
  targetToken: '',
  selectedDex: 'jupiter',
  intensity: 'medium',
  pattern: 'organic',
  dailyTargetSol: 50,
  maxWallets: 10,
  minSwapSol: 0.01,
  maxSwapSol: 0.1,
  minIntervalMs: 30000,
  maxIntervalMs: 120000,
}

// Load config from localStorage
function loadConfig(): VolumeConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle any missing fields
      return { ...defaultConfig, ...parsed, enabled: false }; // Always start stopped
    }
  } catch (e) {
    console.error('Failed to load volume config from localStorage:', e);
  }
  return defaultConfig;
}

// Save config to localStorage
function saveConfig(config: VolumeConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save volume config to localStorage:', e);
  }
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

interface TransactionLog {
  id: string;
  timestamp: number;
  type: 'buy' | 'sell';
  amount: number;
  wallet: string;
  status: 'success' | 'failed' | 'pending';
  txHash?: string;
}

// Use WSOL from DEX constants
const WSOL = KNOWN_MINTS.WSOL;

export function VolumeControl() {
  const { rpcUrl, network } = useNetwork();
  const { wallets, isLocked, getKeypairs } = useSecureWallet({ rpcUrl });
  const { addToken } = useActiveTokens();
  const { addTrade } = useTxHistory();
  
  const [config, setConfig] = useState<VolumeConfig>(() => loadConfig())
  const [stats, setStats] = useState<VolumeStats>({ ...mockStats, totalVolume24h: 0, swapsExecuted: 0, currentRate: 0 })
  const [isRunning, setIsRunning] = useState(false)
  const [txLogs, setTxLogs] = useState<TransactionLog[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [jupiterApiKey, setJupiterApiKey] = useState(() => localStorage.getItem('jupiter_api_key') || '')
  const [useRealTrades, setUseRealTrades] = useState(false)
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const updateConfig = (updates: Partial<VolumeConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      saveConfig(newConfig);
      return newConfig;
    })
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
  
  // Save Jupiter API key to localStorage
  useEffect(() => {
    if (jupiterApiKey) {
      localStorage.setItem('jupiter_api_key', jupiterApiKey);
    }
  }, [jupiterApiKey]);

  // Execute real swap via selected DEX
  const executeRealSwap = useCallback(async (isBuy: boolean, amountSol: number) => {
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      throw new Error('No wallets available. Unlock your vault first.');
    }

    // Check if selected DEX is implemented
    const swapper = getSwapper(config.selectedDex);
    if (!swapper.isImplemented) {
      throw new Error(`${swapper.name} is not yet implemented. Please use Jupiter.`);
    }

    // Filter to selected wallets only, or use all if none selected
    let availableKeypairs = allKeypairs;
    if (selectedWalletIds.length > 0) {
      availableKeypairs = allKeypairs.filter((_kp, idx) => {
        const wallet = wallets[idx];
        return wallet && selectedWalletIds.includes(wallet.id);
      });
      if (availableKeypairs.length === 0) {
        availableKeypairs = allKeypairs; // Fallback to all
      }
    }

    // Pick a random wallet from available ones
    const walletIndex = Math.floor(Math.random() * availableKeypairs.length);
    const wallet = availableKeypairs[walletIndex];

    const inputMint = isBuy ? WSOL : config.targetToken;
    const outputMint = isBuy ? config.targetToken : WSOL;
    const amountLamports = Math.floor(amountSol * 1e9);

    // DEX config
    const dexConfig: DexConfig = {
      rpcUrl,
      apiKey: jupiterApiKey || undefined,
      slippageBps: 200, // 2% slippage
    };

    // Get quote from selected DEX
    const quote = await getQuote(
      config.selectedDex,
      inputMint,
      outputMint,
      amountLamports,
      dexConfig
    );

    // Execute swap
    const result = await dexExecuteSwap(quote, wallet, dexConfig);

    if (!result.success) {
      throw new Error(result.error || 'Swap failed');
    }

    return {
      success: true,
      txHash: result.txHash,
      wallet: result.wallet
    };
  }, [getKeypairs, rpcUrl, jupiterApiKey, config, selectedWalletIds, wallets]);

  const handleToggle = () => {
    if (!isRunning) {
      // Starting
      if (!config.targetToken) {
        alert('Please enter a target token mint address');
        return;
      }
      if (useRealTrades && !jupiterApiKey) {
        alert('Please enter your Jupiter API key for real trades');
        return;
      }
      if (useRealTrades && isLocked) {
        alert('Please unlock your wallet vault first (go to Wallets page)');
        return;
      }
      setStartTime(Date.now());
      setStats(prev => ({ ...prev, totalVolume24h: 0, swapsExecuted: 0, currentRate: 0 }));
      setTxLogs([]);
      
      // Add token to active tokens for Detection Dashboard
      addToken({
        mint: config.targetToken,
        source: 'volume'
      });
    } else {
      // Stopping
      setStartTime(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    setIsRunning(!isRunning)
    updateConfig({ enabled: !isRunning })
  }

  // Transaction generation loop
  useEffect(() => {
    if (!isRunning) return;

    const executeTrade = async () => {
      const isBuy = Math.random() > 0.5;
      const amount = config.minSwapSol + Math.random() * (config.maxSwapSol - config.minSwapSol);

      if (useRealTrades) {
        // REAL ON-CHAIN TRADE
        const pendingTx: TransactionLog = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
          type: isBuy ? 'buy' : 'sell',
          amount: parseFloat(amount.toFixed(4)),
          wallet: 'Executing...',
          status: 'pending',
        };
        setTxLogs(prev => [pendingTx, ...prev].slice(0, 50));

        try {
          const result = await executeRealSwap(isBuy, amount);
          
          // Update the pending tx with result
          setTxLogs(prev => prev.map(tx => 
            tx.id === pendingTx.id 
              ? { ...tx, status: 'success' as const, txHash: result.txHash, wallet: result.wallet }
              : tx
          ));

          // Record trade for chart markers
          addTrade({
            timestamp: Date.now(),
            type: isBuy ? 'buy' : 'sell',
            tokenMint: config.targetToken,
            amount: parseFloat(amount.toFixed(4)),
            wallet: result.wallet,
            txHash: result.txHash,
            status: 'success'
          });

          setStats(prev => ({
            ...prev,
            swapsExecuted: prev.swapsExecuted + 1,
            totalVolume24h: prev.totalVolume24h + amount,
            currentRate: (prev.totalVolume24h + amount) / ((Date.now() - (startTime || Date.now())) / 3600000) || 0,
            successRate: ((prev.swapsExecuted * prev.successRate / 100) + 1) / (prev.swapsExecuted + 1) * 100,
          }));
        } catch (err) {
          console.error('Swap failed:', err);
          setTxLogs(prev => prev.map(tx => 
            tx.id === pendingTx.id 
              ? { ...tx, status: 'failed' as const, wallet: (err as Error).message.slice(0, 30) }
              : tx
          ));
        }
      } else {
        // SIMULATION MODE
        const walletNum = Math.floor(Math.random() * config.maxWallets) + 1;
        const success = Math.random() > 0.05;

        const newTx: TransactionLog = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
          type: isBuy ? 'buy' : 'sell',
          amount: parseFloat(amount.toFixed(4)),
          wallet: `Wallet ${walletNum} (sim)`,
          status: success ? 'success' : 'failed',
          txHash: success ? `sim-${Math.random().toString(36).slice(2)}` : undefined,
        };

        setTxLogs(prev => [newTx, ...prev].slice(0, 50));

        if (success) {
          // Record simulated trade for chart markers
          addTrade({
            timestamp: Date.now(),
            type: isBuy ? 'buy' : 'sell',
            tokenMint: config.targetToken,
            amount: parseFloat(amount.toFixed(4)),
            wallet: `Wallet ${walletNum} (sim)`,
            txHash: newTx.txHash,
            status: 'success'
          });

          setStats(prev => ({
            ...prev,
            swapsExecuted: prev.swapsExecuted + 1,
            totalVolume24h: prev.totalVolume24h + amount,
            currentRate: (prev.totalVolume24h + amount) / ((Date.now() - (startTime || Date.now())) / 3600000) || 0,
            successRate: ((prev.swapsExecuted * prev.successRate / 100) + 1) / (prev.swapsExecuted + 1) * 100,
          }));
        }
      }
    };

    // Execute first trade immediately
    executeTrade();

    // Set interval based on config (real trades use actual intervals, sim uses fast demo)
    const intervalMs = useRealTrades 
      ? config.minIntervalMs + Math.random() * (config.maxIntervalMs - config.minIntervalMs)
      : 2000 + Math.random() * 3000; // Fast demo for simulation

    intervalRef.current = setInterval(executeTrade, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, config, startTime, useRealTrades, executeRealSwap, addTrade]);
  
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
          
          {/* Real Trades Toggle */}
          <div className="p-4 rounded-lg border-2 border-dashed border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Trading Mode</span>
              </div>
              <button
                onClick={() => setUseRealTrades(!useRealTrades)}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  useRealTrades ? 'bg-orange-500' : 'bg-slate-700'
                }`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  useRealTrades ? 'translate-x-8' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className={`text-sm ${useRealTrades ? 'text-orange-400' : 'text-slate-500'}`}>
              {useRealTrades ? '🔴 REAL TRADES - Will spend actual SOL!' : '🟢 Simulation Mode - No real transactions'}
            </p>
          </div>

          {/* DEX Selector */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              DEX / Exchange
            </label>
            <div className="relative">
              <select
                value={config.selectedDex}
                onChange={(e) => updateConfig({ selectedDex: e.target.value as DexType })}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:border-emerald-500 pr-10"
              >
                {(Object.keys(DEX_INFO) as DexType[]).map((dexType) => {
                  const info = DEX_INFO[dexType];
                  return (
                    <option key={dexType} value={dexType}>
                      {info.name} {!info.isImplemented ? '(Coming Soon)' : ''}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: DEX_INFO[config.selectedDex].color }}
              />
              <p className="text-xs text-slate-500">
                {DEX_INFO[config.selectedDex].description}
              </p>
            </div>
            {!DEX_INFO[config.selectedDex].isImplemented && (
              <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mt-2">
                <p className="text-xs text-yellow-400">
                  ⚠️ {DEX_INFO[config.selectedDex].name} is not yet implemented. 
                  Real trades will fail. Use Jupiter for live trading.
                </p>
              </div>
            )}
          </div>

          {/* API Key (only for real trades) */}
          {useRealTrades && (
            <div className="space-y-2">
              <label className="text-sm text-slate-400 flex items-center gap-2">
                <Key className="w-4 h-4" />
                {config.selectedDex === 'jupiter' ? 'Jupiter API Key' : 'API Key (optional)'}
              </label>
              <input
                type="password"
                value={jupiterApiKey}
                onChange={(e) => setJupiterApiKey(e.target.value)}
                placeholder={config.selectedDex === 'jupiter' ? 'Enter your Jupiter API key...' : 'API key if required...'}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
              {config.selectedDex === 'jupiter' && (
                <p className="text-xs text-slate-500">
                  Get a free key at <a href="https://portal.jup.ag" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">portal.jup.ag</a>
                </p>
              )}
            </div>
          )}

          {/* Wallet Status */}
          {useRealTrades && (
            <div className={`p-4 rounded-lg ${
              isLocked ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {isLocked ? (
                  <>
                    <XCircle className="w-5 h-5 text-red-400" />
                    <div>
                      <p className="text-sm text-red-400 font-medium">Wallet Locked</p>
                      <p className="text-xs text-slate-400">Unlock your vault on the Wallets page to trade</p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <div>
                      <p className="text-sm text-emerald-400 font-medium">Wallet Ready</p>
                      <p className="text-xs text-slate-400">{wallets.length} wallet(s) available</p>
                    </div>
                  </>
                )}
              </div>
              {!isLocked && wallets.length > 0 && (
                <div className="pt-3 border-t border-slate-700/50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-400">Available Balance:</span>
                    <span className="text-lg font-bold text-white">
                      {(selectedWalletIds.length > 0 
                        ? wallets.filter(w => selectedWalletIds.includes(w.id)).reduce((sum, w) => sum + (w.balance || 0), 0)
                        : wallets.reduce((sum, w) => sum + (w.balance || 0), 0)
                      ).toFixed(4)} SOL
                    </span>
                  </div>
                  
                  <p className="text-xs text-slate-400 mb-2">Select wallets to use:</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {wallets.map((w, i) => {
                      const isSelected = selectedWalletIds.includes(w.id);
                      return (
                        <label
                          key={w.id || i}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-slate-800/50 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedWalletIds(prev => [...prev, w.id]);
                                } else {
                                  setSelectedWalletIds(prev => prev.filter(id => id !== w.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-slate-700"
                            />
                            <span className="text-sm text-white">{w.name || `Wallet ${i+1}`}</span>
                          </div>
                          <span className="text-sm text-slate-400">{(w.balance || 0).toFixed(4)} SOL</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedWalletIds.length === 0 && (
                    <p className="text-xs text-yellow-400 mt-2">⚠️ No wallets selected — will use all wallets</p>
                  )}
                </div>
              )}
            </div>
          )}

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

      {/* Health Monitor */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Health Monitor
          </h3>
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: DEX_INFO[config.selectedDex].color }}
            />
            <span className="text-sm text-slate-400">
              via {DEX_INFO[config.selectedDex].name}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-lg border ${isRunning ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex items-center gap-2 mb-2">
              {isRunning ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-slate-500" />
              )}
              <span className="text-sm text-slate-400">Status</span>
            </div>
            <p className={`text-lg font-bold ${isRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isRunning ? 'RUNNING' : 'STOPPED'}
            </p>
          </div>
          
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-slate-400">Uptime</span>
            </div>
            <p className="text-lg font-bold text-white">
              {startTime ? formatUptime(Date.now() - startTime) : '--:--:--'}
            </p>
          </div>
          
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-slate-400">Rate</span>
            </div>
            <p className="text-lg font-bold text-white">
              {stats.currentRate.toFixed(2)} <span className="text-sm text-slate-400">SOL/hr</span>
            </p>
          </div>
          
          <div className="p-4 rounded-lg bg-slate-800 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-yellow-400" />
              <span className="text-sm text-slate-400">Success</span>
            </div>
            <p className="text-lg font-bold text-white">
              {stats.swapsExecuted > 0 ? stats.successRate.toFixed(1) : '--'}%
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Activity Overview */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-400" />
            Wallet Activity Proof
          </h3>
          <span className="text-sm text-slate-500">
            {new Set(txLogs.map(tx => tx.wallet)).size} active wallets
          </span>
        </div>

        {txLogs.length === 0 ? (
          <div className="text-center py-6 text-slate-500">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No wallet activity yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Group transactions by wallet */}
            {Array.from(new Set(txLogs.map(tx => tx.wallet))).map(walletName => {
              const walletTxs = txLogs.filter(tx => tx.wallet === walletName);
              const successCount = walletTxs.filter(tx => tx.status === 'success').length;
              const totalVolume = walletTxs.filter(tx => tx.status === 'success').reduce((sum, tx) => sum + tx.amount, 0);
              
              // Find full address if available
              const matchedWallet = wallets.find(w => 
                walletName.includes(w.address?.slice(0, 8) || '') || 
                w.name === walletName.replace(' (sim)', '')
              );
              
              return (
                <div key={walletName} className="bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                        {walletName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{walletName}</p>
                        {matchedWallet && (
                          <a
                            href={`https://solscan.io/account/${matchedWallet.address}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline font-mono flex items-center gap-1"
                          >
                            {matchedWallet.address.slice(0, 12)}...{matchedWallet.address.slice(-8)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-emerald-400 font-medium">{totalVolume.toFixed(4)} SOL</p>
                      <p className="text-xs text-slate-500">{successCount} txs</p>
                    </div>
                  </div>
                  
                  {/* Recent transactions for this wallet */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {walletTxs.slice(0, 5).map(tx => (
                      <div key={tx.id} className="flex items-center justify-between py-1.5 px-2 bg-slate-900/50 rounded text-xs">
                        <div className="flex items-center gap-2">
                          <span className={tx.type === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                            {tx.type === 'buy' ? '↑ BUY' : '↓ SELL'}
                          </span>
                          <span className="text-slate-300">{tx.amount} SOL</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`${
                            tx.status === 'success' ? 'text-emerald-400' : 
                            tx.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {tx.status === 'success' ? '✓' : tx.status === 'pending' ? '⏳' : '✗'}
                          </span>
                          {tx.txHash && tx.status === 'success' && !tx.txHash.startsWith('sim-') ? (
                            <a
                              href={`https://solscan.io/tx/${tx.txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline"
                            >
                              {tx.txHash.slice(0, 8)}...
                            </a>
                          ) : (
                            <span className="text-slate-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {walletTxs.length > 5 && (
                      <p className="text-xs text-slate-500 text-center py-1">+{walletTxs.length - 5} more transactions</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Transaction Log */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Full Transaction Log
          </h3>
          <span className="text-sm text-slate-500">{txLogs.length} total</span>
        </div>
        
        {txLogs.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No transactions yet</p>
            <p className="text-sm">Start boosting to see activity</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Wallet</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">TX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {txLogs.slice(0, 20).map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30">
                    <td className="py-2 text-slate-400">{new Date(tx.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2 text-slate-300 font-mono text-xs">{tx.wallet}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        tx.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {tx.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-white">{tx.amount} SOL</td>
                    <td className="py-2">
                      <span className={`${
                        tx.status === 'success' ? 'text-emerald-400' : 
                        tx.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {tx.txHash && tx.status === 'success' && !tx.txHash.startsWith('sim-') ? (
                        <a
                          href={`https://solscan.io/tx/${tx.txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline flex items-center gap-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txLogs.length > 20 && (
              <p className="text-center text-slate-500 text-sm py-3">Showing 20 of {txLogs.length} transactions</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to format uptime
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default VolumeControl
