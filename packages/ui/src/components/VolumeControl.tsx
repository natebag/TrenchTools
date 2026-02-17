import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  detectTokenVenues,
  getPumpSwapCanonicalFeeProfile,
  estimateRunout,
  type PoolVenueDetection,
  type PumpSwapFeeProfile,
  type RunoutEstimateOutput,
} from '@trenchsniper/core'
import {
  ROTATION_WALLET_PREFIX,
  buildRotationWalletName,
  isRotationManagedWallet,
} from '@/lib/volumeRotation'

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
  estimatedTxFeeSol: number
  walletRotationEnabled: boolean
  walletRotationIntervalSuccesses: number
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
  estimatedTxFeeSol: 0.00005,
  walletRotationEnabled: false,
  walletRotationIntervalSuccesses: 12,
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

function formatPctFromBps(bps: number): string {
  return `${(bps / 100).toFixed(3)}%`;
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

interface WalletRuntimeState {
  solLamports: number;
  tokenRawBalance: bigint;
}

interface RotationChainState {
  sourceWalletId: string;
  sourceAddress: string;
  activeWalletId: string;
  activeWalletAddress: string;
  successfulSwapCount: number;
  generation: number;
}

// Use WSOL from DEX constants
const WSOL = KNOWN_MINTS.WSOL;
const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_RESERVE_LAMPORTS = 5_000_000; // keep some SOL for fees/rent
const ROTATION_SOL_RESERVE_LAMPORTS = 25_000_000; // keep extra SOL for forced-sell + account cleanup
const ROTATION_BOOTSTRAP_LAMPORTS = 1_000_000;
const TRANSFER_FEE_BUFFER_LAMPORTS = 20_000;
const MAX_FORCE_SELL_ATTEMPTS = 12;
const MAX_FORCE_SELL_STAGNANT_ROUNDS = 5;
const FORCE_SELL_BALANCE_POLL_ATTEMPTS = 6;
const FORCE_SELL_BALANCE_POLL_DELAY_MS = 500;
const FORCE_SELL_MAX_CHUNK_ATTEMPTS = 6;
const FORCE_SELL_SLIPPAGE_LADDER_BPS = [300, 700, 1200, 2000, 3500, 5000, 7500, 9000];
const MIN_TRANSFER_LAMPORTS = 1;

export function VolumeControl() {
  const { rpcUrl, network } = useNetwork();
  const {
    wallets,
    isLocked,
    getKeypairs,
    generateWallet,
    removeWallet,
    refreshBalances,
  } = useSecureWallet({ rpcUrl });
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
  const [showRotationPasswordModal, setShowRotationPasswordModal] = useState(false)
  const [rotationPasswordInput, setRotationPasswordInput] = useState('')
  const [rotationError, setRotationError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [resumeTick, setResumeTick] = useState(0)
  const [venueDetection, setVenueDetection] = useState<PoolVenueDetection | null>(null)
  const [feeProfile, setFeeProfile] = useState<PumpSwapFeeProfile | null>(null)
  const [runoutEstimate, setRunoutEstimate] = useState<RunoutEstimateOutput | null>(null)
  const [isEstimateLoading, setIsEstimateLoading] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isExecutingTradeRef = useRef(false)
  const lastTradeAttemptAtRef = useRef<number | null>(null)
  const requireBuyBeforeSellRef = useRef(true)
  const rotationSessionPasswordRef = useRef<string | null>(null)
  const rotationChainsRef = useRef<Map<string, RotationChainState>>(new Map())

  const sourceWallets = useMemo(
    () => wallets.filter(wallet => !isRotationManagedWallet(wallet.name)),
    [wallets]
  )
  const managedRotationWallets = useMemo(
    () => wallets.filter(wallet => isRotationManagedWallet(wallet.name)),
    [wallets]
  )
  const selectedSourceWallets = useMemo(
    () => (selectedWalletIds.length > 0
      ? sourceWallets.filter(wallet => selectedWalletIds.includes(wallet.id))
      : sourceWallets),
    [selectedWalletIds, sourceWallets]
  )
  const isRotationModeActive = useRealTrades && config.walletRotationEnabled

  const totalSelectedBalanceSol = selectedSourceWallets.reduce((sum, wallet) => sum + (wallet.balance || 0), 0)
  const usableSelectedBalanceSol = selectedSourceWallets.reduce((sum, wallet) => {
    const balance = wallet.balance || 0
    const spendable = Math.max(0, balance - (SOL_RESERVE_LAMPORTS / LAMPORTS_PER_SOL))
    return sum + spendable
  }, 0)
  
  const updateConfig = useCallback((updates: Partial<VolumeConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates };
      saveConfig(newConfig);
      return newConfig;
    })
  }, [])
  
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

  useEffect(() => {
    setSelectedWalletIds(prev => {
      const next = prev.filter(walletId => sourceWallets.some(wallet => wallet.id === walletId));
      if (next.length === prev.length && next.every((walletId, idx) => walletId === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [wallets, sourceWallets]);

  useEffect(() => {
    const targetToken = config.targetToken.trim();
    if (!targetToken) {
      setVenueDetection(null);
      setFeeProfile(null);
      setRunoutEstimate(null);
      setEstimateError(null);
      return;
    }

    let targetMint: PublicKey;
    try {
      targetMint = new PublicKey(targetToken);
    } catch {
      setVenueDetection(null);
      setFeeProfile(null);
      setRunoutEstimate(null);
      setEstimateError('Enter a valid token mint to run PumpSwap fee estimation.');
      return;
    }

    let cancelled = false;
    setIsEstimateLoading(true);
    setEstimateError(null);

    const connection = new Connection(rpcUrl, 'confirmed');

    const runEstimate = async () => {
      try {
        const [venues, profile] = await Promise.all([
          detectTokenVenues(connection, targetMint),
          getPumpSwapCanonicalFeeProfile(connection, targetMint),
        ]);

        if (cancelled) return;

        setVenueDetection(venues);
        setFeeProfile(profile);
        setRunoutEstimate(
          estimateRunout({
            usableSol: usableSelectedBalanceSol,
            minSwapSol: config.minSwapSol,
            maxSwapSol: config.maxSwapSol,
            txFeeSol: config.estimatedTxFeeSol,
            creatorFeeBps: profile.selectedFeesBps.creatorFeeBps,
            protocolFeeBps: profile.selectedFeesBps.protocolFeeBps,
            lpFeeBps: profile.selectedFeesBps.lpFeeBps,
          })
        );
      } catch (error) {
        if (cancelled) return;
        setVenueDetection(null);
        setFeeProfile(null);
        setRunoutEstimate(null);
        setEstimateError((error as Error).message || 'Failed to compute PumpSwap estimate');
      } finally {
        if (!cancelled) {
          setIsEstimateLoading(false);
        }
      }
    };

    void runEstimate();

    return () => {
      cancelled = true;
    };
  }, [
    config.targetToken,
    config.minSwapSol,
    config.maxSwapSol,
    config.estimatedTxFeeSol,
    rpcUrl,
    usableSelectedBalanceSol,
  ]);

  const clearRotationRuntimeState = useCallback(() => {
    rotationSessionPasswordRef.current = null;
    rotationChainsRef.current.clear();
    setRotationPasswordInput('');
    setShowRotationPasswordModal(false);
  }, []);

  const pauseVolumeWithError = useCallback((message: string) => {
    setRotationError(message);
    alert(message);
    setIsRunning(false);
    setStartTime(null);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    requireBuyBeforeSellRef.current = true;
    updateConfig({ enabled: false });
    clearRotationRuntimeState();
  }, [clearRotationRuntimeState, updateConfig]);

  const sendSolTransfer = useCallback(async (
    connection: Connection,
    fromSigner: Keypair,
    toPubkey: PublicKey,
    lamports: number,
    feePayerSigner?: Keypair,
  ): Promise<void> => {
    if (lamports < MIN_TRANSFER_LAMPORTS) {
      return;
    }

    const feePayer = feePayerSigner ?? fromSigner;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromSigner.publicKey,
        toPubkey,
        lamports,
      })
    );
    transaction.feePayer = feePayer.publicKey;
    transaction.recentBlockhash = blockhash;
    if (feePayer.publicKey.equals(fromSigner.publicKey)) {
      transaction.sign(fromSigner);
    } else {
      transaction.sign(fromSigner, feePayer);
    }

    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
  }, []);

  const getTargetWalletState = useCallback(async (
    connection: Connection,
    owner: PublicKey,
    targetMint: PublicKey
  ): Promise<{
    solLamports: number;
    tokenRawBalance: bigint;
    tokenAccounts: Array<{ pubkey: PublicKey; amountRaw: bigint; programId: PublicKey }>;
  }> => {
    const [solLamports, tokenAccountsResp] = await Promise.all([
      connection.getBalance(owner, 'confirmed'),
      connection.getParsedTokenAccountsByOwner(owner, { mint: targetMint }, 'confirmed'),
    ]);

    const tokenAccounts = tokenAccountsResp.value.map(account => {
      try {
        const tokenAmount = account.account.data.parsed.info.tokenAmount;
        return {
          pubkey: account.pubkey,
          amountRaw: BigInt(tokenAmount.amount as string),
          programId: account.account.owner,
        };
      } catch {
        return {
          pubkey: account.pubkey,
          amountRaw: 0n,
          programId: account.account.owner,
        };
      }
    });

    const tokenRawBalance = tokenAccounts.reduce((sum, account) => sum + account.amountRaw, 0n);
    return { solLamports, tokenRawBalance, tokenAccounts };
  }, []);

  const consolidateTargetTokenAccounts = useCallback(async (
    connection: Connection,
    ownerSigner: Keypair,
    targetMint: PublicKey,
    tokenAccounts: Array<{ pubkey: PublicKey; amountRaw: bigint; programId: PublicKey }>,
  ): Promise<void> => {
    const nonZeroAccounts = tokenAccounts.filter(account => account.amountRaw > 0n);
    if (nonZeroAccounts.length === 0) {
      return;
    }

    const tokenProgramId = nonZeroAccounts[0].programId;
    const associatedAccount = getAssociatedTokenAddressSync(
      targetMint,
      ownerSigner.publicKey,
      false,
      tokenProgramId
    );
    const associatedExists = tokenAccounts.some(account => account.pubkey.equals(associatedAccount));
    const associatedHasBalance = nonZeroAccounts.some(account => account.pubkey.equals(associatedAccount));
    if (nonZeroAccounts.length === 1 && associatedHasBalance) {
      return;
    }

    if (!associatedExists) {
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          ownerSigner.publicKey,
          associatedAccount,
          ownerSigner.publicKey,
          targetMint,
          tokenProgramId
        )
      );
      createAtaTx.feePayer = ownerSigner.publicKey;
      createAtaTx.recentBlockhash = blockhash;
      createAtaTx.sign(ownerSigner);
      const createAtaSig = await connection.sendRawTransaction(createAtaTx.serialize());
      await connection.confirmTransaction(createAtaSig, 'confirmed');
    }

    for (const account of nonZeroAccounts) {
      if (account.pubkey.equals(associatedAccount)) {
        continue;
      }
      if (!account.programId.equals(tokenProgramId)) {
        continue;
      }

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const transferTx = new Transaction().add(
        createTransferInstruction(
          account.pubkey,
          associatedAccount,
          ownerSigner.publicKey,
          account.amountRaw,
          [],
          tokenProgramId
        )
      );
      transferTx.feePayer = ownerSigner.publicKey;
      transferTx.recentBlockhash = blockhash;
      transferTx.sign(ownerSigner);
      const transferSig = await connection.sendRawTransaction(transferTx.serialize());
      await connection.confirmTransaction(transferSig, 'confirmed');
    }
  }, []);

  const createDexConfig = useCallback((): DexConfig => {
    return {
      rpcUrl,
      apiKey: jupiterApiKey || undefined,
      slippageBps: 200,
    };
  }, [rpcUrl, jupiterApiKey]);

  const forceSellAllTargetBalance = useCallback(async (
    connection: Connection,
    signer: Keypair,
    targetMint: PublicKey,
    dexConfig: DexConfig,
  ): Promise<void> => {
    let previousBalance: bigint | null = null;
    let stagnantRounds = 0;
    let lastFailureReason = 'unknown forced-sell failure';
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < MAX_FORCE_SELL_ATTEMPTS; attempt++) {
      const initialState = await getTargetWalletState(connection, signer.publicKey, targetMint);
      if (initialState.tokenRawBalance === 0n) {
        return;
      }
      if (initialState.tokenAccounts.some(account => account.amountRaw > 0n)) {
        await consolidateTargetTokenAccounts(connection, signer, targetMint, initialState.tokenAccounts);
      }

      const walletState = await getTargetWalletState(connection, signer.publicKey, targetMint);
      if (walletState.tokenRawBalance === 0n) {
        return;
      }

      if (previousBalance !== null && walletState.tokenRawBalance >= previousBalance) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
      }

      if (stagnantRounds >= MAX_FORCE_SELL_STAGNANT_ROUNDS) {
        throw new Error(`Forced sell made no progress. Last error: ${lastFailureReason}`);
      }

      const maxSafeRaw = BigInt(Number.MAX_SAFE_INTEGER);
      const fullSellRaw = walletState.tokenRawBalance > maxSafeRaw
        ? Number.MAX_SAFE_INTEGER
        : Number(walletState.tokenRawBalance);

      let attemptFailure = 'Unknown forced-sell error';
      let swapResult: Awaited<ReturnType<typeof dexExecuteSwap>> | null = null;
      const chunkCandidates: number[] = [];
      let nextChunkRaw = fullSellRaw;
      for (let chunkAttempt = 0; chunkAttempt < FORCE_SELL_MAX_CHUNK_ATTEMPTS; chunkAttempt++) {
        chunkCandidates.push(nextChunkRaw);
        if (nextChunkRaw <= 1) {
          break;
        }
        nextChunkRaw = Math.max(1, Math.floor(nextChunkRaw / 2));
      }

      for (const chunkRaw of chunkCandidates) {
        for (const slippageBps of FORCE_SELL_SLIPPAGE_LADDER_BPS) {
          const adjustedDexConfig: DexConfig = {
            ...dexConfig,
            slippageBps,
          };

          try {
            const quote = await getQuote(
              config.selectedDex,
              config.targetToken,
              WSOL,
              chunkRaw,
              adjustedDexConfig
            );

            const attemptResult = await dexExecuteSwap(quote, signer, adjustedDexConfig);
            if (!attemptResult.success) {
              attemptFailure = attemptResult.error || 'Swap failed';
              continue;
            }

            swapResult = attemptResult;
            break;
          } catch (error) {
            attemptFailure = (error as Error).message || 'Quote/swap error';
          }
        }

        if (swapResult?.success) {
          break;
        }
      }

      if (!swapResult?.success) {
        lastFailureReason = attemptFailure;
        previousBalance = walletState.tokenRawBalance;
        await sleep(FORCE_SELL_BALANCE_POLL_DELAY_MS * (attempt + 1));
        continue;
      }

      if (swapResult.txHash) {
        try {
          await connection.confirmTransaction(swapResult.txHash, 'confirmed');
        } catch {
          // Fallback to balance polling below; some RPCs lag transaction confirmation responses.
        }
      }

      let observedImprovement = false;
      for (let poll = 0; poll < FORCE_SELL_BALANCE_POLL_ATTEMPTS; poll++) {
        await sleep(FORCE_SELL_BALANCE_POLL_DELAY_MS * (poll + 1));
        const polledState = await getTargetWalletState(connection, signer.publicKey, targetMint);
        if (polledState.tokenRawBalance === 0n || polledState.tokenRawBalance < walletState.tokenRawBalance) {
          previousBalance = polledState.tokenRawBalance;
          stagnantRounds = 0;
          observedImprovement = true;
          break;
        }
      }

      if (!observedImprovement) {
        previousBalance = walletState.tokenRawBalance;
        lastFailureReason = `Swap landed but token balance did not decrease (attempt ${attempt + 1}).`;
      }
    }

    const finalState = await getTargetWalletState(connection, signer.publicKey, targetMint);
    throw new Error(
      `Unable to fully sell target token after ${MAX_FORCE_SELL_ATTEMPTS} attempts. Remaining raw balance: ${finalState.tokenRawBalance.toString()}. Last error: ${lastFailureReason}`
    );
  }, [config.selectedDex, config.targetToken, getTargetWalletState, consolidateTargetTokenAccounts]);

  const closeZeroBalanceTargetAccounts = useCallback(async (
    connection: Connection,
    ownerSigner: Keypair,
    rentDestination: PublicKey,
    feePayerSigner: Keypair,
    tokenAccounts: Array<{ pubkey: PublicKey; amountRaw: bigint; programId: PublicKey }>,
  ): Promise<void> => {
    for (const tokenAccount of tokenAccounts) {
      if (tokenAccount.amountRaw !== 0n) {
        throw new Error('Cannot close target token account with non-zero balance.');
      }

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction().add(
        createCloseAccountInstruction(
          tokenAccount.pubkey,
          rentDestination,
          ownerSigner.publicKey,
          [],
          tokenAccount.programId ?? TOKEN_PROGRAM_ID
        )
      );
      transaction.feePayer = feePayerSigner.publicKey;
      transaction.recentBlockhash = blockhash;
      if (feePayerSigner.publicKey.equals(ownerSigner.publicKey)) {
        transaction.sign(ownerSigner);
      } else {
        transaction.sign(ownerSigner, feePayerSigner);
      }

      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
    }
  }, []);

  const initializeRotationChains = useCallback(async (): Promise<number> => {
    const sessionPassword = rotationSessionPasswordRef.current;
    if (!sessionPassword) {
      throw new Error('Rotation session password is required.');
    }

    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      throw new Error('No wallets available. Unlock your vault first.');
    }

    const keypairByAddress = new Map(allKeypairs.map(kp => [kp.publicKey.toBase58(), kp] as const));
    const sourceCandidates = selectedSourceWallets.length > 0 ? selectedSourceWallets : sourceWallets;
    if (sourceCandidates.length === 0) {
      throw new Error('No source wallets available for rotation.');
    }

    const maxWalletsToUse = Math.max(1, Math.min(config.maxWallets || sourceCandidates.length, sourceCandidates.length));
    const selectedSources = sourceCandidates.slice(0, maxWalletsToUse);
    const connection = new Connection(rpcUrl, 'confirmed');
    const initializedChains = new Map<string, RotationChainState>();

    for (const sourceWallet of selectedSources) {
      const sourceSigner = keypairByAddress.get(sourceWallet.address);
      if (!sourceSigner) {
        throw new Error(`Signer missing for source wallet ${sourceWallet.name}.`);
      }

      const managedWallet = await generateWallet(
        buildRotationWalletName(sourceWallet.address, 1),
        'burner',
        sessionPassword
      );
      const refreshedKeypairs = getKeypairs();
      const managedSigner = refreshedKeypairs.find(kp => kp.publicKey.toBase58() === managedWallet.address);
      if (!managedSigner) {
        throw new Error(`Generated rotation wallet signer unavailable for ${sourceWallet.name}.`);
      }

      const sourceBalance = await connection.getBalance(sourceSigner.publicKey, 'confirmed');
      const spendableLamports = Math.max(0, sourceBalance - SOL_RESERVE_LAMPORTS);
      if (spendableLamports <= 0) {
        throw new Error(`Source wallet ${sourceWallet.name} has no spendable SOL.`);
      }

      await sendSolTransfer(
        connection,
        sourceSigner,
        managedSigner.publicKey,
        spendableLamports
      );

      initializedChains.set(sourceWallet.id, {
        sourceWalletId: sourceWallet.id,
        sourceAddress: sourceWallet.address,
        activeWalletId: managedWallet.id,
        activeWalletAddress: managedWallet.address,
        successfulSwapCount: 0,
        generation: 1,
      });
    }

    rotationChainsRef.current = initializedChains;
    await refreshBalances();
    return initializedChains.size;
  }, [
    getKeypairs,
    selectedSourceWallets,
    sourceWallets,
    config.maxWallets,
    rpcUrl,
    generateWallet,
    sendSolTransfer,
    refreshBalances,
  ]);

  const rotateWalletChain = useCallback(async (chain: RotationChainState): Promise<void> => {
    const sessionPassword = rotationSessionPasswordRef.current;
    if (!sessionPassword) {
      throw new Error('Rotation session password is missing.');
    }

    let targetMintPubkey: PublicKey;
    try {
      targetMintPubkey = new PublicKey(config.targetToken);
    } catch {
      throw new Error('Invalid target token mint for rotation cleanup.');
    }

    const allKeypairs = getKeypairs();
    const keypairByAddress = new Map(allKeypairs.map(kp => [kp.publicKey.toBase58(), kp] as const));
    const oldSigner = keypairByAddress.get(chain.activeWalletAddress);
    if (!oldSigner) {
      throw new Error(`Active rotation signer not found (${chain.activeWalletAddress}).`);
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    const dexConfig = createDexConfig();

    // Step 1: force-sell remaining target token balance.
    await forceSellAllTargetBalance(connection, oldSigner, targetMintPubkey, dexConfig);

    // Step 2: verify target token balance is fully cleared.
    const postSellState = await getTargetWalletState(connection, oldSigner.publicKey, targetMintPubkey);
    if (postSellState.tokenRawBalance !== 0n) {
      throw new Error('Rotation aborted: target token balance remains after forced sell.');
    }

    // Step 3: create next managed rotation wallet.
    const nextGeneration = chain.generation + 1;
    const nextWallet = await generateWallet(
      buildRotationWalletName(chain.sourceAddress, nextGeneration),
      'burner',
      sessionPassword
    );
    const refreshedKeypairs = getKeypairs();
    const nextSigner = refreshedKeypairs.find(kp => kp.publicKey.toBase58() === nextWallet.address);
    if (!nextSigner) {
      throw new Error(`Failed to load signer for new rotation wallet ${nextWallet.address}.`);
    }

    // Step 4: bootstrap SOL to initialize new wallet on-chain (must satisfy rent-exempt minimum).
    const [oldBalanceBeforeBootstrap, systemRentExemptLamports] = await Promise.all([
      connection.getBalance(oldSigner.publicKey, 'confirmed'),
      connection.getMinimumBalanceForRentExemption(0, 'confirmed'),
    ]);
    const requiredBootstrapLamports = Math.max(ROTATION_BOOTSTRAP_LAMPORTS, systemRentExemptLamports);
    const maxBootstrapLamports = Math.max(0, oldBalanceBeforeBootstrap - TRANSFER_FEE_BUFFER_LAMPORTS);
    if (maxBootstrapLamports < requiredBootstrapLamports) {
      throw new Error(
        `Insufficient SOL to initialize next rotation wallet. Need at least ${requiredBootstrapLamports + TRANSFER_FEE_BUFFER_LAMPORTS} lamports, have ${oldBalanceBeforeBootstrap}.`
      );
    }
    await sendSolTransfer(
      connection,
      oldSigner,
      nextSigner.publicKey,
      requiredBootstrapLamports
    );

    // Step 5: close zero-balance target token accounts, recover rent to new wallet.
    const closeCandidates = await getTargetWalletState(connection, oldSigner.publicKey, targetMintPubkey);
    if (closeCandidates.tokenRawBalance !== 0n) {
      throw new Error('Rotation aborted: target token balance changed before account close.');
    }
    await closeZeroBalanceTargetAccounts(
      connection,
      oldSigner,
      nextSigner.publicKey,
      nextSigner,
      closeCandidates.tokenAccounts
    );

    // Step 6: drain remaining SOL with new wallet paying fee so old wallet can be fully emptied.
    const oldBalanceBeforeDrain = await connection.getBalance(oldSigner.publicKey, 'confirmed');
    if (oldBalanceBeforeDrain > 0) {
      await sendSolTransfer(
        connection,
        oldSigner,
        nextSigner.publicKey,
        oldBalanceBeforeDrain,
        nextSigner
      );
    }

    // Step 7: remove retired managed wallet from vault.
    await removeWallet(chain.activeWalletId, sessionPassword);

    // Step 8: promote new wallet and reset chain counter.
    chain.activeWalletId = nextWallet.id;
    chain.activeWalletAddress = nextWallet.address;
    chain.successfulSwapCount = 0;
    chain.generation = nextGeneration;
    rotationChainsRef.current.set(chain.sourceWalletId, chain);
    await refreshBalances();
  }, [
    config.targetToken,
    getKeypairs,
    rpcUrl,
    createDexConfig,
    forceSellAllTargetBalance,
    getTargetWalletState,
    generateWallet,
    sendSolTransfer,
    closeZeroBalanceTargetAccounts,
    removeWallet,
    refreshBalances,
  ]);

  // Execute real swap via selected DEX
  const executeRealSwap = useCallback(async (preferredBuy: boolean, targetAmountSol: number) => {
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      throw new Error('No wallets available. Unlock your vault first.');
    }

    const swapper = getSwapper(config.selectedDex);
    if (!swapper.isImplemented) {
      throw new Error(`${swapper.name} is not yet implemented. Please use Jupiter.`);
    }

    let targetMintPubkey: PublicKey;
    try {
      targetMintPubkey = new PublicKey(config.targetToken);
    } catch {
      throw new Error('Invalid target token mint address');
    }

    const keypairByAddress = new Map(allKeypairs.map(kp => [kp.publicKey.toBase58(), kp] as const));
    const dexConfig = createDexConfig();

    type RuntimeWalletCandidate = {
      walletId: string;
      walletAddress: string;
      walletLabel: string;
      signer: Keypair;
    };

    let candidates: RuntimeWalletCandidate[] = [];
    if (isRotationModeActive) {
      const chains = Array.from(rotationChainsRef.current.values());
      if (chains.length === 0) {
        throw new Error('Rotation mode has no active chains. Stop and start again.');
      }

      candidates = chains
        .map(chain => {
          const signer = keypairByAddress.get(chain.activeWalletAddress);
          if (!signer) return null;
          const walletMeta = wallets.find(w => w.id === chain.activeWalletId || w.address === chain.activeWalletAddress);
          return {
            walletId: chain.activeWalletId,
            walletAddress: chain.activeWalletAddress,
            walletLabel: walletMeta?.name || `${chain.activeWalletAddress.slice(0, 8)}...`,
            signer,
          };
        })
        .filter((candidate): candidate is RuntimeWalletCandidate => Boolean(candidate));
    } else {
      const baseWallets = selectedSourceWallets.length > 0 ? selectedSourceWallets : sourceWallets;
      if (baseWallets.length === 0) {
        throw new Error('No source wallets selected for trading.');
      }

      const maxWalletsToUse = Math.max(1, Math.min(config.maxWallets || baseWallets.length, baseWallets.length));
      const shuffledWallets = [...baseWallets].sort(() => Math.random() - 0.5).slice(0, maxWalletsToUse);
      candidates = shuffledWallets
        .map(wallet => {
          const signer = keypairByAddress.get(wallet.address);
          if (!signer) return null;
          return {
            walletId: wallet.id,
            walletAddress: wallet.address,
            walletLabel: wallet.name || `${wallet.address.slice(0, 8)}...`,
            signer,
          };
        })
        .filter((candidate): candidate is RuntimeWalletCandidate => Boolean(candidate));
    }

    if (candidates.length === 0) {
      throw new Error('No signer available for selected wallets. Unlock vault and retry.');
    }

    const clampRawToSafeNumber = (amountRaw: bigint): number => {
      if (amountRaw <= 0n) return 0;
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      return Number(amountRaw > maxSafe ? maxSafe : amountRaw);
    };

    const chooseSellAmountRaw = (tokenRawBalance: bigint, forceMax: boolean): bigint => {
      if (tokenRawBalance <= 0n) return 0n;
      if (forceMax || tokenRawBalance < 1000n) return tokenRawBalance;
      const percentage = BigInt(25 + Math.floor(Math.random() * 51));
      const partialAmount = (tokenRawBalance * percentage) / 100n;
      return partialAmount > 0n ? partialAmount : tokenRawBalance;
    };

    type TradePlan = {
      isBuy: boolean;
      inputMint: string;
      outputMint: string;
      amountRaw: number;
      amountSolEquivalent: number;
      walletId: string;
      walletAddress: string;
      walletLabel: string;
      signer: Keypair;
      tokenRawBalance: bigint;
      forceSellMax: boolean;
    };

    const connection = new Connection(rpcUrl, 'confirmed');
    const minBuyLamports = Math.max(1, Math.floor(config.minSwapSol * LAMPORTS_PER_SOL));
    const desiredBuyLamports = Math.max(1, Math.floor(targetAmountSol * LAMPORTS_PER_SOL));

    let chosenPlan: TradePlan | null = null;

    for (const candidate of candidates) {
      let walletState: WalletRuntimeState;
      try {
        walletState = await getTargetWalletState(
          connection,
          new PublicKey(candidate.walletAddress),
          targetMintPubkey
        );
      } catch (walletStateError) {
        console.warn('Skipping wallet due to balance fetch error:', candidate.walletAddress, walletStateError);
        continue;
      }

      const reserveLamports = isRotationModeActive ? ROTATION_SOL_RESERVE_LAMPORTS : SOL_RESERVE_LAMPORTS;
      const spendableLamports = Math.max(0, walletState.solLamports - reserveLamports);
      const canBuy = spendableLamports >= minBuyLamports;
      const hasTokenBalance = walletState.tokenRawBalance > 0n;

      const makeBuyPlan = (): TradePlan | null => {
        if (!canBuy) return null;
        const amountRaw = Math.max(minBuyLamports, Math.min(desiredBuyLamports, spendableLamports));
        return {
          isBuy: true,
          inputMint: WSOL,
          outputMint: config.targetToken,
          amountRaw,
          amountSolEquivalent: amountRaw / LAMPORTS_PER_SOL,
          walletId: candidate.walletId,
          walletAddress: candidate.walletAddress,
          walletLabel: candidate.walletLabel,
          signer: candidate.signer,
          tokenRawBalance: walletState.tokenRawBalance,
          forceSellMax: false,
        };
      };

      const makeSellPlan = (forceMax: boolean): TradePlan | null => {
        if (!hasTokenBalance) return null;
        const sellRawBigInt = chooseSellAmountRaw(walletState.tokenRawBalance, forceMax);
        const amountRaw = clampRawToSafeNumber(sellRawBigInt);
        if (amountRaw <= 0) return null;
        return {
          isBuy: false,
          inputMint: config.targetToken,
          outputMint: WSOL,
          amountRaw,
          amountSolEquivalent: targetAmountSol,
          walletId: candidate.walletId,
          walletAddress: candidate.walletAddress,
          walletLabel: candidate.walletLabel,
          signer: candidate.signer,
          tokenRawBalance: walletState.tokenRawBalance,
          forceSellMax: forceMax,
        };
      };

      if (preferredBuy) {
        chosenPlan = makeBuyPlan() ?? makeSellPlan(true);
      } else {
        chosenPlan = makeSellPlan(spendableLamports < minBuyLamports) ?? makeBuyPlan();
      }

      if (chosenPlan) break;
    }

    if (!chosenPlan) {
      throw new Error('No executable trade found. Need SOL for buys or token balance for sells.');
    }

    const runPlan = async (plan: TradePlan) => {
      const quote = await getQuote(
        config.selectedDex,
        plan.inputMint,
        plan.outputMint,
        plan.amountRaw,
        dexConfig
      );

      const swapResult = await dexExecuteSwap(quote, plan.signer, dexConfig);
      if (!swapResult.success) {
        throw new Error(swapResult.error || 'Swap failed');
      }
      return swapResult;
    };

    try {
      const swapResult = await runPlan(chosenPlan);
      return {
        success: true,
        txHash: swapResult.txHash,
        wallet: chosenPlan.walletLabel,
        executedWalletId: chosenPlan.walletId,
        executedWalletAddress: chosenPlan.walletAddress,
        type: chosenPlan.isBuy ? 'buy' as const : 'sell' as const,
        amountSol: chosenPlan.amountSolEquivalent,
      };
    } catch (error) {
      if (!chosenPlan.isBuy && !chosenPlan.forceSellMax) {
        const maxSellRaw = clampRawToSafeNumber(chosenPlan.tokenRawBalance);
        if (maxSellRaw > chosenPlan.amountRaw) {
          const retryPlan = { ...chosenPlan, amountRaw: maxSellRaw, forceSellMax: true };
          try {
            const retryResult = await runPlan(retryPlan);
            return {
              success: true,
              txHash: retryResult.txHash,
              wallet: retryPlan.walletLabel,
              executedWalletId: retryPlan.walletId,
              executedWalletAddress: retryPlan.walletAddress,
              type: 'sell' as const,
              amountSol: retryPlan.amountSolEquivalent,
            };
          } catch (retryError) {
            throw new Error(`${(error as Error).message}; retry sell max failed: ${(retryError as Error).message}`);
          }
        }
      }
      throw error;
    }
  }, [
    getKeypairs,
    config.selectedDex,
    config.targetToken,
    config.maxWallets,
    config.minSwapSol,
    sourceWallets,
    selectedSourceWallets,
    wallets,
    rpcUrl,
    createDexConfig,
    getTargetWalletState,
    isRotationModeActive,
  ]);

  const stopBoosting = useCallback(() => {
    setStartTime(null);
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    requireBuyBeforeSellRef.current = true;
    setIsRunning(false);
    updateConfig({ enabled: false });
    clearRotationRuntimeState();
    setIsStarting(false);
  }, [clearRotationRuntimeState, updateConfig]);

  const startBoosting = useCallback(async () => {
    if (isStarting) return;

    if (!config.targetToken) {
      throw new Error('Please enter a target token mint address');
    }
    if (useRealTrades && !jupiterApiKey) {
      throw new Error('Please enter your Jupiter API key for real trades');
    }
    if (useRealTrades && isLocked) {
      throw new Error('Please unlock your wallet vault first (go to Wallets page)');
    }
    if (!useRealTrades && config.walletRotationEnabled) {
      throw new Error('Wallet rotation mode only runs with real trades enabled.');
    }
    if (isRotationModeActive && !rotationSessionPasswordRef.current) {
      throw new Error('Enter your vault password to start rotation mode.');
    }

    setIsStarting(true);
    setRotationError(null);
    try {
      let activeWalletCount = 0;
      if (isRotationModeActive) {
        activeWalletCount = await initializeRotationChains();
      } else {
        rotationChainsRef.current.clear();
        if (!useRealTrades) {
          activeWalletCount = Math.max(1, config.maxWallets || 1);
        } else {
          const baseWallets = selectedSourceWallets.length > 0 ? selectedSourceWallets : sourceWallets;
          if (baseWallets.length === 0) {
            throw new Error('No source wallets available for trading.');
          }
          activeWalletCount = Math.max(1, Math.min(config.maxWallets || baseWallets.length, baseWallets.length));
        }
      }

      requireBuyBeforeSellRef.current = true;
      setStartTime(Date.now());
      setStats({
        totalVolume24h: 0,
        swapsExecuted: 0,
        currentRate: 0,
        activeWallets: activeWalletCount,
        successRate: 0,
      });
      setTxLogs([]);

      addToken({
        mint: config.targetToken,
        source: 'volume'
      });

      setIsRunning(true);
      updateConfig({ enabled: true });
    } finally {
      setIsStarting(false);
    }
  }, [
    isStarting,
    config,
    useRealTrades,
    jupiterApiKey,
    isLocked,
    isRotationModeActive,
    initializeRotationChains,
    selectedSourceWallets,
    sourceWallets,
    addToken,
    updateConfig,
  ]);

  const handleRotationPasswordConfirm = useCallback(() => {
    if (!rotationPasswordInput) {
      setRotationError('Vault password is required for rotation mode.');
      return;
    }
    rotationSessionPasswordRef.current = rotationPasswordInput;
    setShowRotationPasswordModal(false);
    setRotationPasswordInput('');
    void startBoosting().catch(error => {
      clearRotationRuntimeState();
      setRotationError((error as Error).message);
      updateConfig({ enabled: false });
    });
  }, [rotationPasswordInput, startBoosting, clearRotationRuntimeState, updateConfig]);

  const handleToggle = () => {
    if (isRunning) {
      stopBoosting();
      return;
    }

    if (isRotationModeActive && !rotationSessionPasswordRef.current) {
      setShowRotationPasswordModal(true);
      return;
    }

    void startBoosting().catch(error => {
      clearRotationRuntimeState();
      setRotationError((error as Error).message);
      updateConfig({ enabled: false });
    });
  }

  const getNextIntervalMs = useCallback(() => {
    if (!useRealTrades) {
      return 2000 + Math.random() * 3000;
    }
    const min = Math.max(1000, config.minIntervalMs);
    const max = Math.max(min, config.maxIntervalMs);
    return min + Math.random() * (max - min);
  }, [useRealTrades, config.minIntervalMs, config.maxIntervalMs]);

  const executeTrade = useCallback(async () => {
    lastTradeAttemptAtRef.current = Date.now();
    const preferredIsBuy = requireBuyBeforeSellRef.current ? true : Math.random() > 0.5;
    const amount = config.minSwapSol + Math.random() * (config.maxSwapSol - config.minSwapSol);

    if (useRealTrades) {
      // REAL ON-CHAIN TRADE
      const pendingTx: TransactionLog = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        type: preferredIsBuy ? 'buy' : 'sell',
        amount: parseFloat(amount.toFixed(4)),
        wallet: 'Executing...',
        status: 'pending',
      };
      setTxLogs(prev => [pendingTx, ...prev].slice(0, 50));

      try {
        const result = await executeRealSwap(preferredIsBuy, amount);
        const executedAmountSol = parseFloat(result.amountSol.toFixed(4));
        
        // Update the pending tx with result
        setTxLogs(prev => prev.map(tx => 
          tx.id === pendingTx.id 
            ? {
                ...tx,
                status: 'success' as const,
                type: result.type,
                amount: executedAmountSol,
                txHash: result.txHash,
                wallet: result.wallet,
              }
            : tx
        ));

        // Record trade for chart markers
        addTrade({
          timestamp: Date.now(),
          type: result.type,
          tokenMint: config.targetToken,
          amount: executedAmountSol,
          wallet: result.wallet,
          txHash: result.txHash,
          status: 'success'
        });

        setStats(prev => ({
          ...prev,
          swapsExecuted: prev.swapsExecuted + 1,
          totalVolume24h: prev.totalVolume24h + executedAmountSol,
          currentRate: (prev.totalVolume24h + executedAmountSol) / ((Date.now() - (startTime || Date.now())) / 3600000) || 0,
          successRate: ((prev.swapsExecuted * prev.successRate / 100) + 1) / (prev.swapsExecuted + 1) * 100,
        }));
        if (result.type === 'buy') {
          requireBuyBeforeSellRef.current = false;
        }

        if (isRotationModeActive) {
          const matchingChain = Array.from(rotationChainsRef.current.values()).find(chain =>
            chain.activeWalletId === result.executedWalletId ||
            chain.activeWalletAddress === result.executedWalletAddress
          );

          if (matchingChain) {
            matchingChain.successfulSwapCount += 1;
            rotationChainsRef.current.set(matchingChain.sourceWalletId, matchingChain);

            if (matchingChain.successfulSwapCount >= Math.max(1, config.walletRotationIntervalSuccesses)) {
              try {
                await rotateWalletChain(matchingChain);
              } catch (rotationErr) {
                pauseVolumeWithError(
                  `Rotation cleanup failed for source ${matchingChain.sourceAddress.slice(0, 8)}...: ${(rotationErr as Error).message}`
                );
                return;
              }
            }
          }
        }
      } catch (err) {
        console.error('Swap failed:', err);
        setTxLogs(prev => prev.map(tx => 
          tx.id === pendingTx.id 
            ? { ...tx, status: 'failed' as const, wallet: (err as Error).message.slice(0, 30) }
            : tx
        ));
      }
      return;
    }

    // SIMULATION MODE
    const walletNum = Math.floor(Math.random() * config.maxWallets) + 1;
    const success = Math.random() > 0.05;

    const newTx: TransactionLog = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      type: preferredIsBuy ? 'buy' : 'sell',
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
        type: preferredIsBuy ? 'buy' : 'sell',
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
      if (preferredIsBuy) {
        requireBuyBeforeSellRef.current = false;
      }
    }
  }, [
    config,
    useRealTrades,
    executeRealSwap,
    addTrade,
    startTime,
    isRotationModeActive,
    rotateWalletChain,
    pauseVolumeWithError,
  ]);

  // Transaction generation loop
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const runAndSchedule = async () => {
      if (cancelled || isExecutingTradeRef.current) {
        return;
      }

      isExecutingTradeRef.current = true;
      try {
        await executeTrade();
      } finally {
        isExecutingTradeRef.current = false;
      }

      if (cancelled || !isRunning) {
        return;
      }

      const nextDelay = getNextIntervalMs();
      intervalRef.current = setTimeout(runAndSchedule, nextDelay);
    };

    void runAndSchedule();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, executeTrade, getNextIntervalMs, resumeTick]);

  // Browsers can heavily throttle timers on background tabs; force a resume pulse on visibility/focus.
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const handleResume = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const lastAttempt = lastTradeAttemptAtRef.current;
      const staleThresholdMs = Math.max(config.maxIntervalMs * 2, 60000);
      if (!lastAttempt || Date.now() - lastAttempt >= staleThresholdMs) {
        setResumeTick(prev => prev + 1);
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
    };
  }, [isRunning, config.maxIntervalMs]);

  useEffect(() => {
    return () => {
      clearRotationRuntimeState();
    };
  }, [clearRotationRuntimeState]);

  const estimateWarnings = [
    ...(venueDetection?.warnings ?? []),
    ...(feeProfile?.warnings ?? []),
  ];
  const feeSourceText =
    feeProfile?.selectedFeeSource === 'canonical_tier'
      ? 'Canonical PumpSwap tier'
      : feeProfile?.selectedFeeSource === 'flat_fees'
        ? 'PumpSwap flat fees'
        : 'Fallback flat fees';
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Volume Control</h2>
          <p className="text-slate-400 mt-1">Configure volume boosting for your token</p>
          <p className="text-xs text-slate-500 mt-1">
            Runs in-browser. If your browser/OS suspends background tabs, trade cadence may pause and auto-resume on focus.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isStarting}
          className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${
            isRunning
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          } ${isStarting ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isRunning ? (
            <>
              <Pause className="w-4 h-4" />
              Stop Boosting
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              {isStarting ? 'Starting...' : 'Start Boosting'}
            </>
          )}
        </button>
      </div>

      {rotationError && (
        <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10">
          <p className="text-sm text-red-200">{rotationError}</p>
        </div>
      )}
      
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
                      <p className="text-xs text-slate-400">{sourceWallets.length} source wallet(s) available</p>
                    </div>
                  </>
                )}
              </div>
              {!isLocked && sourceWallets.length > 0 && (
                <div className="pt-3 border-t border-slate-700/50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-slate-400">Available Balance:</span>
                    <span className="text-lg font-bold text-white">
                      {totalSelectedBalanceSol.toFixed(4)} SOL
                    </span>
                  </div>
                  
                  <p className="text-xs text-slate-400 mb-2">Select source wallets to use:</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {sourceWallets.map((w, i) => {
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
                    <p className="text-xs text-yellow-400 mt-2">⚠️ No wallets selected — will use all source wallets</p>
                  )}
                </div>
              )}
              {!isLocked && managedRotationWallets.length > 0 && (
                <div className="pt-3 border-t border-slate-700/50 mt-3">
                  <p className="text-xs text-amber-300 mb-2">
                    {ROTATION_WALLET_PREFIX} managed wallets (read-only): {managedRotationWallets.length}
                  </p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {managedRotationWallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700"
                      >
                        <span className="text-xs text-slate-300">{wallet.name}</span>
                        <span className="text-xs text-slate-400">{(wallet.balance || 0).toFixed(4)} SOL</span>
                      </div>
                    ))}
                  </div>
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

          {/* Wallet Rotation Mode */}
          <div className="space-y-3 p-3 rounded-lg border border-slate-700 bg-slate-900/40">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">Wallet Rotation Mode</p>
                <p className="text-xs text-slate-400">
                  Create managed burner wallets and rotate per successful swap count.
                </p>
              </div>
              <button
                onClick={() => updateConfig({ walletRotationEnabled: !config.walletRotationEnabled })}
                disabled={!useRealTrades}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  config.walletRotationEnabled ? 'bg-amber-500' : 'bg-slate-700'
                } ${!useRealTrades ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  config.walletRotationEnabled ? 'translate-x-8' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">Rotate every successful swaps</label>
              <input
                type="number"
                min={1}
                value={config.walletRotationIntervalSuccesses}
                onChange={(e) => updateConfig({ walletRotationIntervalSuccesses: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                disabled={!config.walletRotationEnabled}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
              />
            </div>
            {!useRealTrades && (
              <p className="text-xs text-yellow-400">Enable real trades to use wallet rotation.</p>
            )}
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
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Est. TX Fee (SOL)</label>
                <input
                  type="number"
                  value={config.estimatedTxFeeSol}
                  onChange={(e) => updateConfig({ estimatedTxFeeSol: parseFloat(e.target.value) || 0 })}
                  step={0.00001}
                  min={0}
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

      {/* PumpSwap Runout Estimator */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            PumpSwap Runout Estimator
          </h3>
          <span className="text-xs text-slate-500">
            Uses on-chain PumpSwap fee config + pool checks
          </span>
        </div>

        {isEstimateLoading && (
          <p className="text-sm text-slate-400">Loading venue + fee profile...</p>
        )}

        {estimateError && (
          <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10">
            <p className="text-sm text-red-300">{estimateError}</p>
          </div>
        )}

        {!isEstimateLoading && !estimateError && runoutEstimate && feeProfile && venueDetection && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">PumpFun Bonding Curve</p>
                <p className={`text-sm font-medium ${venueDetection.isOnPumpFunBondingCurve ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {venueDetection.isOnPumpFunBondingCurve ? 'Detected' : 'Not detected'}
                </p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">PumpSwap Canonical Pool</p>
                <p className={`text-sm font-medium ${venueDetection.hasPumpSwapCanonicalPool ? 'text-emerald-400' : 'text-yellow-300'}`}>
                  {venueDetection.hasPumpSwapCanonicalPool ? 'Detected' : 'Not detected'}
                </p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Raydium Pool</p>
                <p className={`text-sm font-medium ${venueDetection.hasRaydiumPool ? 'text-yellow-300' : 'text-slate-300'}`}>
                  {venueDetection.hasRaydiumPool ? 'Detected' : 'Not detected'}
                </p>
              </div>
            </div>

            {!feeProfile.isCanonicalPool && (
              <div className="p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10">
                <p className="text-sm text-yellow-200">
                  Warning: token is not confirmed as canonical PumpSwap pool. Estimate uses flat PumpSwap fees and is still non-blocking.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Usable SOL</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.usableSol.toFixed(4)}</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Avg Swap</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.avgSwapSol.toFixed(4)} SOL</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Projected Swaps</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.maxSwaps.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Projected Volume</p>
                <p className="text-sm font-semibold text-emerald-400">{runoutEstimate.projectedVolumeSol.toFixed(2)} SOL</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Creator Reinvested Volume</p>
                <p className="text-sm font-semibold text-cyan-300">
                  +{runoutEstimate.creatorReinvestedVolumeSol.toFixed(2)} SOL
                </p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Total Volume w/ Reinvest</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {runoutEstimate.totalProjectedVolumeWithCreatorReinvestSol.toFixed(2)} SOL
                </p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Creator Fee Loss</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.creatorLossSol.toFixed(4)} SOL</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Protocol Fee Loss</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.protocolLossSol.toFixed(4)} SOL</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">LP Fee Loss</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.lpLossSol.toFixed(4)} SOL</p>
              </div>
              <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400">Network Fee Loss</p>
                <p className="text-sm font-semibold text-white">{runoutEstimate.networkLossSol.toFixed(4)} SOL</p>
              </div>
            </div>

            <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <span className="text-slate-300">
                  Fee source: <span className="text-white">{feeSourceText}</span>
                </span>
                <span className="text-slate-300">
                  Creator: <span className="text-white">{formatPctFromBps(feeProfile.selectedFeesBps.creatorFeeBps)}</span>
                </span>
                <span className="text-slate-300">
                  Protocol: <span className="text-white">{formatPctFromBps(feeProfile.selectedFeesBps.protocolFeeBps)}</span>
                </span>
                <span className="text-slate-300">
                  LP: <span className="text-white">{formatPctFromBps(feeProfile.selectedFeesBps.lpFeeBps)}</span>
                </span>
                <span className="text-slate-300">
                  Total: <span className="text-emerald-300">{formatPctFromBps(feeProfile.selectedFeesBps.totalFeeBps)}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm">
                <span className="text-slate-300">
                  Total loss: <span className="text-white">{runoutEstimate.totalLossSol.toFixed(4)} SOL</span>
                </span>
                <span className="text-slate-300">
                  Theoretical max (no tx fee): <span className="text-white">{runoutEstimate.theoreticalMaxVolumeSol.toFixed(2)} SOL</span>
                </span>
                <span className="text-slate-300">
                  Efficiency: <span className="text-emerald-300">{runoutEstimate.volumeMultiplier.toFixed(2)}x</span>
                </span>
                <span className="text-slate-300">
                  With creator reinvest: <span className="text-cyan-300">{runoutEstimate.volumeMultiplierWithCreatorReinvest.toFixed(2)}x</span>
                </span>
                <span className="text-slate-300">
                  Reinvest cycles: <span className="text-white">{runoutEstimate.creatorReinvestCycles}</span>
                </span>
              </div>
              {feeProfile.selectedTier && (
                <p className="text-xs text-slate-500 mt-2">
                  Canonical tier threshold: {feeProfile.selectedTier.marketCapSolThreshold.toLocaleString()} SOL market cap
                </p>
              )}
            </div>

            {estimateWarnings.length > 0 && (
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/60">
                <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Diagnostics</p>
                <div className="space-y-1">
                  {estimateWarnings.slice(0, 4).map((warning, idx) => (
                    <p key={`${warning}-${idx}`} className="text-xs text-slate-300">
                      • {warning}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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

      {showRotationPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-full max-w-md mx-4 rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Rotation Mode Authorization</h3>
            <p className="text-sm text-slate-400">
              Enter your vault password once for this run. It stays in memory only and clears when volume mode stops.
            </p>
            <div className="space-y-2">
              <label className="text-xs text-slate-500">Vault Password</label>
              <input
                type="password"
                value={rotationPasswordInput}
                onChange={(e) => setRotationPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRotationPasswordConfirm();
                  }
                }}
                autoFocus
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                placeholder="Enter vault password"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRotationPasswordModal(false);
                  setRotationPasswordInput('');
                }}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRotationPasswordConfirm}
                className="flex-1 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-300"
              >
                Start Rotation
              </button>
            </div>
          </div>
        </div>
      )}
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
