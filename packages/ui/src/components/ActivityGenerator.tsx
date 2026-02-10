import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Activity, 
  Play, 
  Square,
  Wallet,
  Clock,
  Zap,
  ArrowRightLeft,
  Send,
  Image,
  Landmark,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Check
} from 'lucide-react';
import { useWallet } from '@/context/WalletContext';

// Types
interface ActivityConfig {
  selectedWallets: string[];
  duration: 'custom' | '1h' | '6h' | '24h';
  customDurationHours: number;
  intensity: 'low' | 'medium' | 'high';
  transactionTypes: {
    swaps: boolean;
    transfers: boolean;
    nft: boolean;
    defi: boolean;
  };
  minTxSize: number;
  maxTxSize: number;
  minInterval: number;
  maxInterval: number;
}

interface GeneratedTx {
  id: string;
  timestamp: Date;
  type: 'swap' | 'transfer' | 'nft' | 'defi';
  wallet: string;
  walletName: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  description: string;
  txHash?: string;
}

// Presets for intensity
const intensityPresets = {
  low: {
    minTxSize: 0.001,
    maxTxSize: 0.01,
    minInterval: 300,
    maxInterval: 900,
    description: 'Subtle activity - 5-15 min between transactions',
  },
  medium: {
    minTxSize: 0.005,
    maxTxSize: 0.05,
    minInterval: 60,
    maxInterval: 300,
    description: 'Moderate activity - 1-5 min between transactions',
  },
  high: {
    minTxSize: 0.01,
    maxTxSize: 0.1,
    minInterval: 15,
    maxInterval: 60,
    description: 'High activity - 15-60 sec between transactions',
  },
};

// Duration options
const durationOptions = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: 'custom', label: 'Custom', hours: 0 },
];

// Transaction type icons
const txTypeIcons = {
  swap: ArrowRightLeft,
  transfer: Send,
  nft: Image,
  defi: Landmark,
};

const txTypeLabels: Record<string, string> = {
  swap: 'Token Swaps',
  transfer: 'SOL Transfers',
  nft: 'NFT Interactions',
  defi: 'DeFi (stake/unstake)',
  swaps: 'Token Swaps',
  transfers: 'SOL Transfers',
};

// Wallet selector component
function WalletSelector({ 
  wallets, 
  selected, 
  onSelect 
}: { 
  wallets: { id: string; name: string; address: string; balance: number }[];
  selected: string[];
  onSelect: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleWallet = (id: string) => {
    if (selected.includes(id)) {
      onSelect(selected.filter(s => s !== id));
    } else {
      onSelect([...selected, id]);
    }
  };

  const selectAll = () => {
    if (selected.length === wallets.length) {
      onSelect([]);
    } else {
      onSelect(wallets.map(w => w.id));
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-left flex items-center justify-between hover:border-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">
            {selected.length === 0
              ? 'Select wallets...'
              : selected.length === wallets.length
              ? 'All wallets selected'
              : `${selected.length} wallet${selected.length > 1 ? 's' : ''} selected`}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {/* Select All */}
          <button
            onClick={selectAll}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-700/50 border-b border-slate-700"
          >
            <span className="text-emerald-400 font-medium">Select All</span>
            <div className={`w-5 h-5 rounded border flex items-center justify-center ${
              selected.length === wallets.length 
                ? 'bg-emerald-500 border-emerald-500' 
                : 'border-slate-600'
            }`}>
              {selected.length === wallets.length && <Check className="w-3 h-3 text-white" />}
            </div>
          </button>

          {wallets.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500">
              No wallets available. Add wallets first.
            </div>
          ) : (
            wallets.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => toggleWallet(wallet.id)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-700/50"
              >
                <div className="flex flex-col items-start">
                  <span className="text-slate-300">{wallet.name}</span>
                  <span className="text-xs text-slate-500">
                    {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)} • {wallet.balance.toFixed(4)} SOL
                  </span>
                </div>
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                  selected.includes(wallet.id) 
                    ? 'bg-emerald-500 border-emerald-500' 
                    : 'border-slate-600'
                }`}>
                  {selected.includes(wallet.id) && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Intensity selector
function IntensitySelector({ 
  value, 
  onChange 
}: { 
  value: ActivityConfig['intensity']; 
  onChange: (v: ActivityConfig['intensity']) => void;
}) {
  const levels: ActivityConfig['intensity'][] = ['low', 'medium', 'high'];

  return (
    <div className="space-y-3">
      <label className="text-sm text-slate-400">Intensity Level</label>
      <div className="grid grid-cols-3 gap-2">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
              value === level
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{intensityPresets[value].description}</p>
    </div>
  );
}

// Activity log item
function LogItem({ tx }: { tx: GeneratedTx }) {
  const Icon = txTypeIcons[tx.type];
  
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 bg-slate-800/50 rounded-lg animate-slide-in">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
        tx.status === 'success' 
          ? 'bg-emerald-500/20 text-emerald-400' 
          : tx.status === 'failed' 
          ? 'bg-red-500/20 text-red-400'
          : 'bg-yellow-500/20 text-yellow-400'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300 truncate">{tx.description}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{tx.walletName}</span>
          <span>•</span>
          <span>{tx.amount.toFixed(4)} SOL</span>
          <span>•</span>
          <span>{tx.timestamp.toLocaleTimeString()}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {tx.status === 'pending' && <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />}
        {tx.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {tx.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
      </div>
    </div>
  );
}

// Preview timeline component
function PreviewTimeline({ 
  config, 
  estimatedTxCount 
}: { 
  config: ActivityConfig; 
  estimatedTxCount: number;
}) {
  // Generate mock timeline points
  const points = Array.from({ length: Math.min(estimatedTxCount, 20) }, (_, i) => ({
    position: (i / Math.min(estimatedTxCount, 20)) * 100,
    type: Object.entries(config.transactionTypes)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type)[Math.floor(Math.random() * Object.values(config.transactionTypes).filter(Boolean).length)] as keyof typeof txTypeIcons,
  }));

  return (
    <div className="relative h-12 bg-slate-800 rounded-lg overflow-hidden">
      {/* Timeline track */}
      <div className="absolute inset-0 flex items-center">
        <div className="h-0.5 bg-slate-700 w-full" />
      </div>
      
      {/* Transaction points */}
      {points.map((point, i) => {
        const Icon = txTypeIcons[point.type] || Activity;
        return (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: `${point.position}%` }}
          >
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
              <Icon className="w-2 h-2 text-emerald-400" />
            </div>
          </div>
        );
      })}
      
      {/* Labels */}
      <div className="absolute bottom-0 left-2 text-[10px] text-slate-500">Start</div>
      <div className="absolute bottom-0 right-2 text-[10px] text-slate-500">End</div>
    </div>
  );
}

// Main component
export function ActivityGenerator() {
  const { wallets, addActivity } = useWallet();
  
  const [config, setConfig] = useState<ActivityConfig>({
    selectedWallets: [],
    duration: '1h',
    customDurationHours: 2,
    intensity: 'medium',
    transactionTypes: {
      swaps: true,
      transfers: true,
      nft: false,
      defi: false,
    },
    minTxSize: intensityPresets.medium.minTxSize,
    maxTxSize: intensityPresets.medium.maxTxSize,
    minInterval: intensityPresets.medium.minInterval,
    maxInterval: intensityPresets.medium.maxInterval,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [txLog, setTxLog] = useState<GeneratedTx[]>([]);
  const [stats, setStats] = useState({ success: 0, failed: 0, total: 0 });
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Calculate estimates
  const getDurationHours = useCallback(() => {
    if (config.duration === 'custom') return config.customDurationHours;
    const opt = durationOptions.find(d => d.value === config.duration);
    return opt?.hours || 1;
  }, [config.duration, config.customDurationHours]);

  const estimatedTxCount = (() => {
    const durationSeconds = getDurationHours() * 3600;
    const avgInterval = (config.minInterval + config.maxInterval) / 2;
    const txPerWallet = Math.floor(durationSeconds / avgInterval);
    return txPerWallet * config.selectedWallets.length;
  })();

  const estimatedCost = (() => {
    // Estimate ~0.000005 SOL per transaction as fee
    const feePerTx = 0.000005;
    const avgTxSize = (config.minTxSize + config.maxTxSize) / 2;
    return (estimatedTxCount * feePerTx) + (estimatedTxCount * avgTxSize * 0.01); // small % for slippage
  })();

  // Update config helper
  const updateConfig = (updates: Partial<ActivityConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  // Handle intensity change
  const handleIntensityChange = (intensity: ActivityConfig['intensity']) => {
    const preset = intensityPresets[intensity];
    updateConfig({
      intensity,
      minTxSize: preset.minTxSize,
      maxTxSize: preset.maxTxSize,
      minInterval: preset.minInterval,
      maxInterval: preset.maxInterval,
    });
  };

  // Generate random transaction
  const generateTransaction = useCallback((): GeneratedTx | null => {
    if (config.selectedWallets.length === 0) return null;

    const enabledTypes = Object.entries(config.transactionTypes)
      .filter(([, enabled]) => enabled)
      .map(([type]) => type as 'swaps' | 'transfers' | 'nft' | 'defi');

    if (enabledTypes.length === 0) return null;

    const walletId = config.selectedWallets[Math.floor(Math.random() * config.selectedWallets.length)];
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) return null;

    const type = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    const amount = config.minTxSize + Math.random() * (config.maxTxSize - config.minTxSize);

    const typeMap: Record<string, GeneratedTx['type']> = {
      swaps: 'swap',
      transfers: 'transfer',
      nft: 'nft',
      defi: 'defi',
    };

    const descriptions: Record<string, string[]> = {
      swaps: [
        `Swap SOL → USDC`,
        `Swap SOL → BONK`,
        `Swap USDC → SOL`,
        `Swap SOL → JUP`,
        `Swap RAY → SOL`,
      ],
      transfers: [
        `Transfer SOL`,
        `Send SOL to friend`,
        `Move funds`,
      ],
      nft: [
        `List NFT on Magic Eden`,
        `Bid on NFT collection`,
        `Transfer NFT`,
      ],
      defi: [
        `Stake SOL on Marinade`,
        `Unstake from Lido`,
        `Add liquidity on Raydium`,
        `Remove LP position`,
      ],
    };

    return {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type: typeMap[type],
      wallet: wallet.address,
      walletName: wallet.name,
      amount,
      status: 'pending',
      description: descriptions[type][Math.floor(Math.random() * descriptions[type].length)],
    };
  }, [config, wallets]);

  // Start generation
  const handleStart = () => {
    if (config.selectedWallets.length === 0) return;
    
    const enabledTypes = Object.values(config.transactionTypes).some(Boolean);
    if (!enabledTypes) return;

    setIsRunning(true);
    setProgress(0);
    setTxLog([]);
    setStats({ success: 0, failed: 0, total: 0 });
    startTimeRef.current = Date.now();

    addActivity({
      type: 'fund',
      description: `Started activity generation for ${config.selectedWallets.length} wallet(s)`,
    });

    // Simulate transaction generation
    const durationMs = getDurationHours() * 3600 * 1000;
    const avgInterval = ((config.minInterval + config.maxInterval) / 2) * 1000;

    // For demo, speed up by 100x
    const speedMultiplier = 100;
    const simulatedInterval = avgInterval / speedMultiplier;
    const simulatedDuration = durationMs / speedMultiplier;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / simulatedDuration) * 100, 100);
      setProgress(newProgress);

      // Generate transaction
      const tx = generateTransaction();
      if (tx) {
        // Add as pending
        setTxLog(prev => [tx, ...prev].slice(0, 50));
        setStats(prev => ({ ...prev, total: prev.total + 1 }));

        // Simulate completion after random delay
        setTimeout(() => {
          const success = Math.random() > 0.05; // 95% success rate
          setTxLog(prev =>
            prev.map(t =>
              t.id === tx.id
                ? { ...t, status: success ? 'success' : 'failed' }
                : t
            )
          );
          setStats(prev => ({
            ...prev,
            success: prev.success + (success ? 1 : 0),
            failed: prev.failed + (success ? 0 : 1),
          }));
        }, 500 + Math.random() * 1500);
      }

      // Check if done
      if (newProgress >= 100) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsRunning(false);
        addActivity({
          type: 'fund',
          description: `Completed activity generation`,
        });
      }
    }, simulatedInterval);
  };

  // Stop generation
  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    addActivity({
      type: 'fund',
      description: `Stopped activity generation`,
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Export log
  const exportLog = () => {
    const data = txLog.map(tx => ({
      timestamp: tx.timestamp.toISOString(),
      type: tx.type,
      wallet: tx.wallet,
      walletName: tx.walletName,
      amount: tx.amount,
      status: tx.status,
      description: tx.description,
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canStart = config.selectedWallets.length > 0 && 
    Object.values(config.transactionTypes).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Activity Generator</h2>
          <p className="text-slate-400 mt-1">Generate natural-looking transaction history for wallets</p>
        </div>
        
        {isRunning ? (
          <button
            onClick={handleStop}
            className="px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop Generation
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${
              canStart
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4" />
            Start Generation
          </button>
        )}
      </div>

      {/* Progress bar when running */}
      {isRunning && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-400">Generation Progress</span>
            <span className="text-sm font-medium text-emerald-400">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>{stats.total} transactions generated</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                {stats.success}
              </span>
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3 text-red-400" />
                {stats.failed}
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* Wallet Selection */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Wallet Selection
            </h3>
            
            <WalletSelector
              wallets={wallets.map(w => ({ 
                id: w.id, 
                name: w.name, 
                address: w.address, 
                balance: w.balance 
              }))}
              selected={config.selectedWallets}
              onSelect={(ids) => updateConfig({ selectedWallets: ids })}
            />
            
            {config.selectedWallets.length > 0 && (
              <p className="text-xs text-slate-500">
                Total balance: {wallets
                  .filter(w => config.selectedWallets.includes(w.id))
                  .reduce((sum, w) => sum + w.balance, 0)
                  .toFixed(4)} SOL
              </p>
            )}
          </div>

          {/* Duration & Intensity */}
          <div className="card space-y-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              Activity Configuration
            </h3>
            
            {/* Duration */}
            <div className="space-y-3">
              <label className="text-sm text-slate-400">Duration</label>
              <div className="grid grid-cols-4 gap-2">
                {durationOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateConfig({ duration: opt.value as ActivityConfig['duration'] })}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      config.duration === opt.value
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              
              {config.duration === 'custom' && (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={config.customDurationHours}
                    onChange={(e) => updateConfig({ customDurationHours: parseFloat(e.target.value) || 1 })}
                    min={0.5}
                    max={168}
                    step={0.5}
                    className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-sm text-slate-400">hours</span>
                </div>
              )}
            </div>
            
            {/* Intensity */}
            <IntensitySelector
              value={config.intensity}
              onChange={handleIntensityChange}
            />
          </div>

          {/* Transaction Types */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              Transaction Types
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(config.transactionTypes) as [keyof typeof config.transactionTypes, boolean][]).map(([type, enabled]) => {
                const typeKey = type === 'swaps' ? 'swap' : type === 'transfers' ? 'transfer' : type as keyof typeof txTypeIcons;
                const Icon = txTypeIcons[typeKey] || Activity;
                return (
                  <button
                    key={type}
                    onClick={() => updateConfig({
                      transactionTypes: {
                        ...config.transactionTypes,
                        [type]: !enabled,
                      },
                    })}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      enabled
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      enabled ? 'bg-emerald-500/20' : 'bg-slate-700'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">{txTypeLabels[type]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white">Advanced Settings</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Min TX Size (SOL)</label>
                <input
                  type="number"
                  value={config.minTxSize}
                  onChange={(e) => updateConfig({ minTxSize: parseFloat(e.target.value) || 0 })}
                  step={0.001}
                  min={0.0001}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Max TX Size (SOL)</label>
                <input
                  type="number"
                  value={config.maxTxSize}
                  onChange={(e) => updateConfig({ maxTxSize: parseFloat(e.target.value) || 0 })}
                  step={0.01}
                  min={0.001}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Min Interval (sec)</label>
                <input
                  type="number"
                  value={config.minInterval}
                  onChange={(e) => updateConfig({ minInterval: parseInt(e.target.value) || 0 })}
                  min={5}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Max Interval (sec)</label>
                <input
                  type="number"
                  value={config.maxInterval}
                  onChange={(e) => updateConfig({ maxInterval: parseInt(e.target.value) || 0 })}
                  min={10}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Preview & Log */}
        <div className="space-y-6">
          {/* Preview */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Generation Preview
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800 rounded-lg">
                <p className="text-2xl font-bold text-white">{estimatedTxCount}</p>
                <p className="text-xs text-slate-400">Estimated Transactions</p>
              </div>
              <div className="p-4 bg-slate-800 rounded-lg">
                <p className="text-2xl font-bold text-white">{estimatedCost.toFixed(4)}</p>
                <p className="text-xs text-slate-400">Estimated Cost (SOL)</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Randomization Preview</p>
              <PreviewTimeline config={config} estimatedTxCount={estimatedTxCount} />
            </div>

            {!canStart && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-400 font-medium">Configuration Required</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {config.selectedWallets.length === 0 && 'Select at least one wallet. '}
                    {!Object.values(config.transactionTypes).some(Boolean) && 'Enable at least one transaction type.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Activity Log
              </h3>
              {txLog.length > 0 && (
                <button
                  onClick={exportLog}
                  className="text-sm text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {txLog.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No activity yet</p>
                  <p className="text-xs mt-1">Start generation to see transactions here</p>
                </div>
              ) : (
                txLog.map((tx) => <LogItem key={tx.id} tx={tx} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ActivityGenerator;
