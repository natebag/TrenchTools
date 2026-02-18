import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Check,
  Plus,
  X,
  ExternalLink,
  Lock,
  Coins
} from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import {
  getQuote,
  executeSwap as dexExecuteSwap,
  getHeliusPriorityFee,
  type DexConfig,
} from '@/lib/dex';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenConfig {
  mint: string;
  symbol: string;
  enabled: boolean;
}

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
  minInterval: number;  // seconds
  maxInterval: number;  // seconds
  tokens: TokenConfig[];
}

interface GeneratedTx {
  id: string;
  timestamp: Date;
  type: 'swap' | 'transfer' | 'nft' | 'defi';
  wallet: string;
  walletId: string;
  walletName: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  description: string;
  txHash?: string;
  errorMessage?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const CONFIG_STORAGE_KEY = 'trench_activity_config';

const POPULAR_TOKENS: TokenConfig[] = [
  { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', enabled: true },
  { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', enabled: true },
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', enabled: true },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', enabled: true },
  { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', enabled: true },
  { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', symbol: 'RAY', enabled: true },
];

const POPULAR_MINT_SET = new Set(POPULAR_TOKENS.map(t => t.mint));

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

const durationOptions = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: 'custom', label: 'Custom', hours: 0 },
];

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

// Default config
const defaultConfig: ActivityConfig = {
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
  tokens: [...POPULAR_TOKENS],
};

function loadSavedConfig(): ActivityConfig {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultConfig,
        ...parsed,
        // Force NFT/DeFi off (not implemented)
        transactionTypes: {
          ...defaultConfig.transactionTypes,
          ...(parsed.transactionTypes || {}),
          nft: false,
          defi: false,
        },
        // Ensure tokens exist
        tokens: parsed.tokens?.length ? parsed.tokens : [...POPULAR_TOKENS],
      };
    }
  } catch { /* ignore */ }
  return defaultConfig;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function TokenSelector({
  tokens,
  onToggle,
  onAdd,
  onRemove,
}: {
  tokens: TokenConfig[];
  onToggle: (mint: string) => void;
  onAdd: (mint: string, symbol: string) => void;
  onRemove: (mint: string) => void;
}) {
  const [newMint, setNewMint] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = () => {
    setAddError('');
    const mint = newMint.trim();
    const symbol = newSymbol.trim() || mint.slice(0, 4) + '..';

    if (!mint) { setAddError('Enter a mint address'); return; }
    if (mint.length < 32 || mint.length > 44) { setAddError('Invalid mint address'); return; }
    try { new PublicKey(mint); } catch { setAddError('Invalid base58 address'); return; }
    if (tokens.some(t => t.mint === mint)) { setAddError('Token already in list'); return; }

    onAdd(mint, symbol);
    setNewMint('');
    setNewSymbol('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tokens.map((token) => {
          const isDefault = POPULAR_MINT_SET.has(token.mint);
          return (
            <button
              key={token.mint}
              onClick={() => onToggle(token.mint)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                token.enabled
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
            >
              <span>{token.symbol}</span>
              {!isDefault && (
                <X
                  className="w-3 h-3 text-slate-500 hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); onRemove(token.mint); }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Token mint address..."
          value={newMint}
          onChange={(e) => setNewMint(e.target.value)}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
        />
        <input
          type="text"
          placeholder="Symbol"
          value={newSymbol}
          onChange={(e) => setNewSymbol(e.target.value)}
          className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
        />
        <button
          onClick={handleAdd}
          className="px-3 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {addError && <p className="text-xs text-red-400">{addError}</p>}
    </div>
  );
}

function LogItem({ tx, network }: { tx: GeneratedTx; network: string }) {
  const Icon = txTypeIcons[tx.type];

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 bg-slate-800/50 rounded-lg">
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
          {tx.txHash && (
            <>
              <span>•</span>
              <a
                href={`https://solscan.io/tx/${tx.txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-0.5"
              >
                {tx.txHash.slice(0, 8)}...
                <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </div>
        {tx.errorMessage && (
          <p className="text-xs text-red-400 mt-0.5 truncate">{tx.errorMessage}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {tx.status === 'pending' && <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />}
        {tx.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        {tx.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
      </div>
    </div>
  );
}

function PreviewTimeline({
  config,
  estimatedTxCount
}: {
  config: ActivityConfig;
  estimatedTxCount: number;
}) {
  // Build list of enabled icon types
  const enabledIcons: (keyof typeof txTypeIcons)[] = [];
  if (config.transactionTypes.swaps) enabledIcons.push('swap');
  if (config.transactionTypes.transfers) enabledIcons.push('transfer');
  if (enabledIcons.length === 0) enabledIcons.push('swap'); // fallback

  const points = Array.from({ length: Math.min(estimatedTxCount, 20) }, (_, i) => ({
    position: (i / Math.min(estimatedTxCount, 20)) * 100,
    type: enabledIcons[Math.floor(Math.random() * enabledIcons.length)],
  }));

  return (
    <div className="relative h-12 bg-slate-800 rounded-lg overflow-hidden">
      <div className="absolute inset-0 flex items-center">
        <div className="h-0.5 bg-slate-700 w-full" />
      </div>

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

      <div className="absolute bottom-0 left-2 text-[10px] text-slate-500">Start</div>
      <div className="absolute bottom-0 right-2 text-[10px] text-slate-500">End</div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ActivityGenerator() {
  // Hooks
  const { wallets, addActivity } = useWallet();
  const { rpcUrl, network } = useNetwork();
  const { isLocked, getKeypairs } = useSecureWallet({ rpcUrl });

  // API keys from settings
  const jupiterApiKey = useMemo(() => {
    return localStorage.getItem('jupiter_api_key') || '';
  }, []);
  const heliusApiKey = useMemo(() => {
    return localStorage.getItem('helius_api_key') || '';
  }, []);

  // Config with localStorage persistence
  const [config, setConfig] = useState<ActivityConfig>(loadSavedConfig);

  useEffect(() => {
    try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  // Running state
  const [isRunning, setIsRunning] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [txLog, setTxLog] = useState<GeneratedTx[]>([]);
  const [stats, setStats] = useState({ success: 0, failed: 0, total: 0 });

  // Refs for stale closure prevention (pattern from BotGroups)
  const startTimeRef = useRef<number>(0);
  const tradeLoopRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isExecutingRef = useRef<Map<string, boolean>>(new Map());
  const lastTradeAtRef = useRef<Map<string, number>>(new Map());
  const walletTokenHoldings = useRef<Map<string, Map<string, string>>>(new Map());
  const configRef = useRef(config);
  configRef.current = config;
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const getDurationHours = useCallback(() => {
    const c = configRef.current;
    if (c.duration === 'custom') return c.customDurationHours;
    const opt = durationOptions.find(d => d.value === c.duration);
    return opt?.hours || 1;
  }, []);

  const estimatedTxCount = (() => {
    const durationSeconds = (config.duration === 'custom' ? config.customDurationHours : (durationOptions.find(d => d.value === config.duration)?.hours || 1)) * 3600;
    const avgInterval = (config.minInterval + config.maxInterval) / 2;
    const txPerWallet = Math.floor(durationSeconds / avgInterval);
    return txPerWallet * config.selectedWallets.length;
  })();

  const estimatedCost = (() => {
    const txFee = 0.000005;
    const avgSize = (config.minTxSize + config.maxTxSize) / 2;
    const swapCostPerTx = (avgSize * 0.02) + txFee;
    const transferCostPerTx = txFee;
    const hasSwaps = config.transactionTypes.swaps;
    const hasTransfers = config.transactionTypes.transfers;
    if (!hasSwaps && !hasTransfers) return 0;
    const avgCost = hasSwaps && hasTransfers
      ? (swapCostPerTx * 0.7 + transferCostPerTx * 0.3)
      : hasSwaps ? swapCostPerTx : transferCostPerTx;
    return estimatedTxCount * avgCost;
  })();

  const updateConfig = (updates: Partial<ActivityConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

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

  const toggleToken = (mint: string) => {
    setConfig(prev => ({
      ...prev,
      tokens: prev.tokens.map(t => t.mint === mint ? { ...t, enabled: !t.enabled } : t),
    }));
  };

  const addCustomToken = (mint: string, symbol: string) => {
    setConfig(prev => ({
      ...prev,
      tokens: [...prev.tokens, { mint, symbol, enabled: true }],
    }));
  };

  const removeToken = (mint: string) => {
    setConfig(prev => ({
      ...prev,
      tokens: prev.tokens.filter(t => t.mint !== mint),
    }));
  };

  // ─── Execution Engine ────────────────────────────────────────────────────

  const executeSwapAction = useCallback(async (
    walletId: string,
    amountSol: number,
  ): Promise<{ success: boolean; txHash?: string; description: string; error?: string }> => {
    const currentWallets = walletsRef.current;
    const currentConfig = configRef.current;
    const allKeypairs = getKeypairs();

    const wallet = currentWallets.find(w => w.id === walletId);
    if (!wallet) throw new Error('Wallet not found');

    const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet.address);
    if (!signer) throw new Error('Signer not found — unlock vault');

    const dexConfig: DexConfig = {
      rpcUrl,
      apiKey: jupiterApiKey || undefined,
      slippageBps: 200,
      heliusApiKey: heliusApiKey || undefined,
    };

    // Check holdings for possible sell
    const holdings = walletTokenHoldings.current.get(walletId) || new Map<string, string>();
    const heldMints = Array.from(holdings.entries());

    // 50% chance to sell if we hold tokens
    if (heldMints.length > 0 && Math.random() > 0.5) {
      const [mint, symbol] = heldMints[Math.floor(Math.random() * heldMints.length)];

      try {
        const connection = new Connection(rpcUrl, 'confirmed');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          signer.publicKey,
          { mint: new PublicKey(mint) },
          'confirmed',
        );

        let rawBalance = 0n;
        for (const acct of tokenAccounts.value) {
          try { rawBalance += BigInt(acct.account.data.parsed.info.tokenAmount.amount); } catch { /* skip */ }
        }

        if (rawBalance > 0n) {
          const sellAmount = Number(rawBalance);
          const quote = await getQuote('jupiter', mint, WSOL_MINT, sellAmount, dexConfig);
          const result = await dexExecuteSwap(quote, signer, dexConfig);

          if (result.success) {
            holdings.delete(mint);
            walletTokenHoldings.current.set(walletId, holdings);
          }

          return {
            success: result.success,
            txHash: result.txHash,
            description: `Swap ${symbol} → SOL`,
            error: result.error,
          };
        } else {
          // Balance is zero — remove from tracking, fall through to buy
          holdings.delete(mint);
        }
      } catch (err) {
        // Sell failed, fall through to buy
        console.warn('Sell attempt failed, will buy instead:', (err as Error).message);
      }
    }

    // BUY: pick random enabled token
    const enabledTokens = currentConfig.tokens.filter(t => t.enabled);
    if (enabledTokens.length === 0) throw new Error('No tokens enabled');

    const token = enabledTokens[Math.floor(Math.random() * enabledTokens.length)];
    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const quote = await getQuote('jupiter', WSOL_MINT, token.mint, amountLamports, dexConfig);
    const result = await dexExecuteSwap(quote, signer, dexConfig);

    if (result.success) {
      holdings.set(token.mint, token.symbol);
      walletTokenHoldings.current.set(walletId, holdings);
    }

    return {
      success: result.success,
      txHash: result.txHash,
      description: `Swap SOL → ${token.symbol}`,
      error: result.error,
    };
  }, [getKeypairs, rpcUrl, jupiterApiKey, heliusApiKey]);

  const executeTransferAction = useCallback(async (
    walletId: string,
    amountSol: number,
  ): Promise<{ success: boolean; txHash?: string; description: string; error?: string }> => {
    const currentWallets = walletsRef.current;
    const currentConfig = configRef.current;
    const allKeypairs = getKeypairs();

    const fromWallet = currentWallets.find(w => w.id === walletId);
    if (!fromWallet) throw new Error('Source wallet not found');

    const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === fromWallet.address);
    if (!signer) throw new Error('Signer not found');

    // Pick a random different wallet from selected
    const otherIds = currentConfig.selectedWallets.filter(id => id !== walletId);
    if (otherIds.length === 0) {
      return { success: false, description: 'Transfer SOL', error: 'Need 2+ wallets for transfers' };
    }

    const toId = otherIds[Math.floor(Math.random() * otherIds.length)];
    const toWallet = currentWallets.find(w => w.id === toId);
    if (!toWallet) return { success: false, description: 'Transfer SOL', error: 'Dest wallet not found' };

    const connection = new Connection(rpcUrl, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    const transaction = new Transaction();

    // Add priority fee if Helius key is available
    if (heliusApiKey) {
      const fee = await getHeliusPriorityFee(heliusApiKey);
      if (fee !== null) {
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee }),
        );
      }
    }

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: new PublicKey(toWallet.address),
        lamports,
      }),
    );
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = signer.publicKey;
    transaction.sign(signer);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    const fromShort = fromWallet.address.slice(0, 4) + '...' + fromWallet.address.slice(-4);
    const toShort = toWallet.address.slice(0, 4) + '...' + toWallet.address.slice(-4);

    return {
      success: true,
      txHash: signature,
      description: `Transfer ${amountSol.toFixed(4)} SOL: ${fromShort} → ${toShort}`,
    };
  }, [getKeypairs, rpcUrl, heliusApiKey]);

  const executeAction = useCallback(async (walletId: string) => {
    const currentConfig = configRef.current;
    const currentWallets = walletsRef.current;
    const wallet = currentWallets.find(w => w.id === walletId);
    if (!wallet) return;

    // Pick enabled real types
    const enabledTypes: ('swaps' | 'transfers')[] = [];
    if (currentConfig.transactionTypes.swaps && currentConfig.tokens.some(t => t.enabled)) {
      enabledTypes.push('swaps');
    }
    if (currentConfig.transactionTypes.transfers && currentConfig.selectedWallets.length >= 2) {
      enabledTypes.push('transfers');
    }
    if (enabledTypes.length === 0) return;

    const chosenType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
    const amount = currentConfig.minTxSize + Math.random() * (currentConfig.maxTxSize - currentConfig.minTxSize);

    // Create pending log entry
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const pendingTx: GeneratedTx = {
      id: txId,
      timestamp: new Date(),
      type: chosenType === 'swaps' ? 'swap' : 'transfer',
      wallet: wallet.address.slice(0, 4) + '...' + wallet.address.slice(-4),
      walletId,
      walletName: wallet.name,
      amount,
      status: 'pending',
      description: chosenType === 'swaps' ? 'Executing swap...' : 'Executing transfer...',
    };

    setTxLog(prev => [pendingTx, ...prev].slice(0, 50));
    setStats(prev => ({ ...prev, total: prev.total + 1 }));

    let result: { success: boolean; txHash?: string; description: string; error?: string };

    try {
      if (chosenType === 'swaps') {
        result = await executeSwapAction(walletId, amount);
      } else {
        result = await executeTransferAction(walletId, amount);
      }
    } catch (err) {
      result = {
        success: false,
        description: chosenType === 'swaps' ? 'Swap failed' : 'Transfer failed',
        error: (err as Error).message,
      };
    }

    // Update log entry with result
    setTxLog(prev => prev.map(tx =>
      tx.id === txId
        ? {
            ...tx,
            status: result.success ? 'success' : 'failed',
            description: result.description,
            txHash: result.txHash,
            errorMessage: result.error,
          }
        : tx,
    ));

    setStats(prev => ({
      ...prev,
      success: prev.success + (result.success ? 1 : 0),
      failed: prev.failed + (result.success ? 0 : 1),
    }));

    // Log to dashboard activity feed
    addActivity({
      type: result.success ? (chosenType === 'swaps' ? 'buy' : 'fund') : 'error',
      description: result.description,
      txHash: result.txHash,
    });
  }, [executeSwapAction, executeTransferAction, addActivity]);

  // ─── Sell All Holdings Back to SOL ──────────────────────────────────────

  const sellAllHoldings = useCallback(async () => {
    const allHoldings = walletTokenHoldings.current;
    if (allHoldings.size === 0) return;

    setIsSelling(true);
    addActivity({ type: 'fund', description: 'Selling all token holdings back to SOL...' });

    const allKeypairs = getKeypairs();
    const currentWallets = walletsRef.current;
    const connection = new Connection(rpcUrl, 'confirmed');
    const dexConfig: DexConfig = {
      rpcUrl,
      apiKey: jupiterApiKey || undefined,
      slippageBps: 200,
      heliusApiKey: heliusApiKey || undefined,
    };

    let sold = 0;
    let errors = 0;

    // For each wallet that has holdings
    for (const [walletId, holdings] of allHoldings.entries()) {
      if (holdings.size === 0) continue;

      const wallet = currentWallets.find(w => w.id === walletId);
      if (!wallet) continue;

      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet.address);
      if (!signer) continue;

      // Fetch all actual on-chain token accounts
      let onChainTokens: { mint: string; amountRaw: string; symbol: string }[] = [];
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          signer.publicKey,
          { programId: SPL_TOKEN_PROGRAM_ID },
          'confirmed',
        );

        onChainTokens = tokenAccounts.value
          .map(acct => {
            const info = acct.account.data.parsed.info;
            const tokenAmount = info.tokenAmount;
            return {
              mint: info.mint as string,
              amountRaw: tokenAmount.amount as string,
              symbol: holdings.get(info.mint as string) || (info.mint as string).slice(0, 6) + '...',
            };
          })
          .filter(t => BigInt(t.amountRaw) > 0n && t.mint !== WSOL_MINT);
      } catch (err) {
        console.error(`Failed to fetch token accounts for ${walletId}:`, err);
        continue;
      }

      // Sell each token back to SOL
      for (const token of onChainTokens) {
        const txId = `sell_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        const pendingTx: GeneratedTx = {
          id: txId,
          timestamp: new Date(),
          type: 'swap',
          wallet: wallet.address.slice(0, 4) + '...' + wallet.address.slice(-4),
          walletId,
          walletName: wallet.name,
          amount: 0,
          status: 'pending',
          description: `Selling ${token.symbol} → SOL...`,
        };
        setTxLog(prev => [pendingTx, ...prev].slice(0, 50));

        try {
          const quote = await getQuote('jupiter', token.mint, WSOL_MINT, parseInt(token.amountRaw), dexConfig);
          const result = await dexExecuteSwap(quote, signer, dexConfig);

          setTxLog(prev => prev.map(tx =>
            tx.id === txId
              ? {
                  ...tx,
                  status: result.success ? 'success' : 'failed',
                  description: result.success ? `Sold ${token.symbol} → SOL` : `Failed to sell ${token.symbol}`,
                  txHash: result.txHash,
                  errorMessage: result.error,
                }
              : tx,
          ));

          if (result.success) {
            sold++;
            setStats(prev => ({ ...prev, total: prev.total + 1, success: prev.success + 1 }));
          } else {
            errors++;
            setStats(prev => ({ ...prev, total: prev.total + 1, failed: prev.failed + 1 }));
          }
        } catch (err) {
          errors++;
          setTxLog(prev => prev.map(tx =>
            tx.id === txId
              ? { ...tx, status: 'failed', description: `Failed to sell ${token.symbol}`, errorMessage: (err as Error).message }
              : tx,
          ));
          setStats(prev => ({ ...prev, total: prev.total + 1, failed: prev.failed + 1 }));
        }
      }
    }

    // Clear holdings tracker
    walletTokenHoldings.current.clear();

    const summaryParts: string[] = ['Activity generation finished.'];
    if (sold > 0) summaryParts.push(`${sold} token(s) sold back to SOL.`);
    if (errors > 0) summaryParts.push(`${errors} sell error(s).`);
    if (sold === 0 && errors === 0) summaryParts.push('No token holdings to sell.');

    addActivity({ type: sold > 0 ? 'sell' : 'fund', description: summaryParts.join(' ') });
    setIsSelling(false);
  }, [getKeypairs, rpcUrl, jupiterApiKey, heliusApiKey, addActivity]);

  // ─── Trade Loop ──────────────────────────────────────────────────────────

  const runWalletLoop = useCallback(async (walletId: string) => {
    const currentConfig = configRef.current;

    // Check duration elapsed
    const durationMs = getDurationHours() * 3600 * 1000;
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed >= durationMs) {
      tradeLoopRefs.current.delete(walletId);
      if (tradeLoopRefs.current.size === 0) {
        setIsRunning(false);
        setProgress(100);
        // Sell all holdings back to SOL on natural completion
        sellAllHoldings();
      }
      return;
    }

    // Update progress
    setProgress(Math.min((elapsed / durationMs) * 100, 100));

    // Guard against concurrent execution
    if (isExecutingRef.current.get(walletId)) return;
    isExecutingRef.current.set(walletId, true);
    lastTradeAtRef.current.set(walletId, Date.now());

    try {
      await executeAction(walletId);
    } catch (err) {
      console.error(`Activity gen error for ${walletId}:`, err);
    } finally {
      isExecutingRef.current.set(walletId, false);
    }

    // Check if still running (might have been stopped during execution)
    if (!isRunningRef.current) return;

    // Check duration again after execution
    const elapsedAfter = Date.now() - startTimeRef.current;
    if (elapsedAfter >= durationMs) {
      tradeLoopRefs.current.delete(walletId);
      if (tradeLoopRefs.current.size === 0) {
        setIsRunning(false);
        setProgress(100);
        // Sell all holdings back to SOL on natural completion
        sellAllHoldings();
      }
      return;
    }

    // Schedule next trade for this wallet
    const minMs = currentConfig.minInterval * 1000;
    const maxMs = currentConfig.maxInterval * 1000;
    const delay = minMs + Math.random() * (maxMs - minMs);

    const timeoutId = setTimeout(() => runWalletLoop(walletId), delay);
    tradeLoopRefs.current.set(walletId, timeoutId);
  }, [executeAction, getDurationHours, addActivity, sellAllHoldings]);

  // ─── Start / Stop ────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (config.selectedWallets.length === 0 || isLocked) return;

    const hasSwaps = config.transactionTypes.swaps && config.tokens.some(t => t.enabled);
    const hasTransfers = config.transactionTypes.transfers && config.selectedWallets.length >= 2;
    if (!hasSwaps && !hasTransfers) return;

    setIsRunning(true);
    setProgress(0);
    setTxLog([]);
    setStats({ success: 0, failed: 0, total: 0 });
    startTimeRef.current = Date.now();
    walletTokenHoldings.current.clear();

    addActivity({
      type: 'fund',
      description: `Started activity generation for ${config.selectedWallets.length} wallet(s)`,
    });

    // Kick off staggered parallel loops — one per wallet
    for (let i = 0; i < config.selectedWallets.length; i++) {
      const walletId = config.selectedWallets[i];
      isExecutingRef.current.set(walletId, false);
      const stagger = (2000 + Math.random() * 3000) + i * (3000 + Math.random() * 5000);
      const timeoutId = setTimeout(() => runWalletLoop(walletId), stagger);
      tradeLoopRefs.current.set(walletId, timeoutId);
    }
  }, [config, isLocked, addActivity, runWalletLoop]);

  const handleStop = useCallback(async () => {
    // 1. Cancel all per-wallet trade loops
    for (const [walletId, timeoutId] of tradeLoopRefs.current.entries()) {
      clearTimeout(timeoutId);
      isExecutingRef.current.delete(walletId);
      lastTradeAtRef.current.delete(walletId);
    }
    tradeLoopRefs.current.clear();
    setIsRunning(false);

    // 2. Sell any held tokens back to SOL
    await sellAllHoldings();
  }, [sellAllHoldings]);

  // ─── Visibility resume (background tab recovery) ─────────────────────────

  useEffect(() => {
    if (!isRunning) return;

    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;
      const cc = configRef.current;
      for (const walletId of cc.selectedWallets) {
        const lastAt = lastTradeAtRef.current.get(walletId);
        const maxMs = cc.maxInterval * 1000;
        const staleThreshold = Math.max(maxMs * 2, 60000);
        if (!lastAt || Date.now() - lastAt >= staleThreshold) {
          const existing = tradeLoopRefs.current.get(walletId);
          if (existing) clearTimeout(existing);
          const delay = 1000 + Math.random() * 3000;
          const tid = setTimeout(() => runWalletLoop(walletId), delay);
          tradeLoopRefs.current.set(walletId, tid);
        }
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isRunning, runWalletLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const tid of tradeLoopRefs.current.values()) clearTimeout(tid);
      tradeLoopRefs.current.clear();
    };
  }, []);

  // ─── Export ──────────────────────────────────────────────────────────────

  const exportLog = () => {
    const data = txLog.map(tx => ({
      timestamp: tx.timestamp.toISOString(),
      type: tx.type,
      wallet: tx.wallet,
      walletName: tx.walletName,
      amount: tx.amount,
      status: tx.status,
      description: tx.description,
      txHash: tx.txHash || null,
      error: tx.errorMessage || null,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Validation ──────────────────────────────────────────────────────────

  const hasSwaps = config.transactionTypes.swaps && config.tokens.some(t => t.enabled);
  const hasTransfers = config.transactionTypes.transfers && config.selectedWallets.length >= 2;
  const canStart = config.selectedWallets.length > 0 && (hasSwaps || hasTransfers) && !isLocked && !isSelling;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Activity Generator</h2>
          <p className="text-slate-400 mt-1">Generate real on-chain transaction history for wallets</p>
        </div>

        {isSelling ? (
          <button
            disabled
            className="px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 bg-orange-500/20 text-orange-400 cursor-not-allowed"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            Selling Holdings...
          </button>
        ) : isRunning ? (
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

      {/* Vault lock warning */}
      {isLocked && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <Lock className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-medium">Wallet Vault Locked</p>
            <p className="text-xs text-slate-400 mt-1">Unlock your vault on the Wallets page before starting activity generation.</p>
          </div>
        </div>
      )}

      {/* Selling holdings indicator */}
      {isSelling && (
        <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="text-sm text-orange-400 font-medium">Selling Token Holdings</p>
            <p className="text-xs text-slate-400 mt-1">Selling all purchased tokens back to SOL via Jupiter. Check the log below for progress.</p>
          </div>
        </div>
      )}

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
              wallets={wallets.filter(w => w.type !== 'burner').map(w => ({
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
                    disabled={isRunning}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      config.duration === opt.value
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    disabled={isRunning}
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
                const isComingSoon = type === 'nft' || type === 'defi';
                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (isComingSoon || isRunning) return;
                      updateConfig({
                        transactionTypes: {
                          ...config.transactionTypes,
                          [type]: !enabled,
                        },
                      });
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isComingSoon
                        ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed opacity-50'
                        : enabled
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    } ${isRunning && !isComingSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isComingSoon ? 'bg-slate-700/50' : enabled ? 'bg-emerald-500/20' : 'bg-slate-700'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">{txTypeLabels[type]}</span>
                    {isComingSoon && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Tokens */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-400" />
              Target Tokens
            </h3>
            <p className="text-xs text-slate-500">Select which tokens the generator will swap into. Add custom tokens by mint address.</p>

            <TokenSelector
              tokens={config.tokens}
              onToggle={toggleToken}
              onAdd={addCustomToken}
              onRemove={removeToken}
            />

            {config.tokens.filter(t => t.enabled).length === 0 && config.transactionTypes.swaps && (
              <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-400">Enable at least one token for swaps to work.</p>
              </div>
            )}
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
                  disabled={isRunning}
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
                  disabled={isRunning}
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
                  disabled={isRunning}
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
                  disabled={isRunning}
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

            {!canStart && !isRunning && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-400 font-medium">Configuration Required</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {config.selectedWallets.length === 0 && 'Select at least one wallet. '}
                    {!hasSwaps && !hasTransfers && config.selectedWallets.length > 0 && 'Enable swaps (with tokens) or transfers (with 2+ wallets). '}
                    {isLocked && 'Unlock your wallet vault. '}
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Real on-chain transactions via Jupiter. If your browser suspends background tabs, cadence may pause and auto-resume on focus.
            </p>
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
                txLog.map((tx) => <LogItem key={tx.id} tx={tx} network={network} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ActivityGenerator;
