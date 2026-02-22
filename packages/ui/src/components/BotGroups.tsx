import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Bot,
  Plus,
  Play,
  Square,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wallet,
  Zap,
  BarChart3,
  Wrench,
  ExternalLink,
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { useSecureWallet } from '@/hooks/useSecureWallet'
import { useNetwork } from '@/context/NetworkContext'
import { isStealthEnabled, isStealthAvailable } from '@/lib/changenow'
import { useStealthFund } from '@/hooks/useStealthFund'
import { useActiveTokens } from '@/context/ActiveTokensContext'
import { useTxHistory } from '@/context/TxHistoryContext'
import {
  getQuote,
  executeSwap as dexExecuteSwap,
  getSwapper,
  getQuote as dexGetQuote,
  KNOWN_MINTS,
  type DexType,
  type DexConfig,
} from '@/lib/dex'
import { getBondingCurveAddress } from '@/lib/dex/pumpfun'
import { filterLaunchWallets } from '@/lib/launchWalletGuard'
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'

// ── Constants ──────────────────────────────────────────────────

const BOT_CONFIGS_STORAGE_KEY = 'trench_bot_configs'
const BOT_RUNTIMES_STORAGE_KEY = 'trench_bot_runtimes'
const MAX_BOT_GROUPS = 6
const WSOL = KNOWN_MINTS.WSOL
const SOL_RESERVE_LAMPORTS = 5_000_000 // 0.005 SOL for fees/rent
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const WSOL_MINT = 'So11111111111111111111111111111111111111112'
const JUPITER_API_URL = 'https://api.jup.ag/swap/v1'

const intensityConfigs = {
  low:        { minSwap: 0.005, maxSwap: 0.02,  minInterval: 120000, maxInterval: 300000 },
  medium:     { minSwap: 0.01,  maxSwap: 0.1,   minInterval: 30000,  maxInterval: 120000 },
  high:       { minSwap: 0.05,  maxSwap: 0.2,   minInterval: 15000,  maxInterval: 60000 },
  aggressive: { minSwap: 0.1,   maxSwap: 0.5,   minInterval: 5000,   maxInterval: 30000 },
}

// ── Types ──────────────────────────────────────────────────────

interface BotGroupConfig {
  id: string
  name: string
  targetToken: string
  walletCount: number
  solPerWallet: number
  pattern: 'organic' | 'steady' | 'burst' | 'wave'
  intensity: 'low' | 'medium' | 'high' | 'aggressive'
  minSwapSol: number
  maxSwapSol: number
  minIntervalMs: number
  maxIntervalMs: number
  createdAt: number
}

interface BotGroupRuntime {
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
  walletIds: string[]
  stats: { swapsExecuted: number; totalVolumeSol: number; startedAt: number | null }
  error: string | null
}

interface WalletTokenHolding {
  mint: string
  amountRaw: string
  amountUi: number
  decimals: number
}

// ── Persistence ────────────────────────────────────────────────

function loadBotConfigs(): BotGroupConfig[] {
  try {
    const stored = localStorage.getItem(BOT_CONFIGS_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* */ }
  return []
}

function saveBotConfigs(configs: BotGroupConfig[]) {
  try {
    localStorage.setItem(BOT_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  } catch { /* */ }
}

// ── Confirmation helper ─────────────────────────────────────────

/** Confirm an already-sent signature using blockhash strategy with fallback. */
async function confirmTx(
  connection: Connection,
  signature: string,
  blockhash?: string,
  lastValidBlockHeight?: number,
): Promise<void> {
  if (blockhash && lastValidBlockHeight) {
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    return
  }
  // Fallback: get a fresh blockhash for the confirmation timeout window
  const latest = await connection.getLatestBlockhash('confirmed')
  try {
    await connection.confirmTransaction({ signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight }, 'confirmed')
  } catch {
    // Timeout — check if tx actually landed
    const status = await connection.getSignatureStatus(signature)
    const cs = status?.value?.confirmationStatus
    if (cs === 'confirmed' || cs === 'finalized') return
    throw new Error(`Transaction not confirmed. Check signature ${signature} on explorer.`)
  }
}

// ── Component ──────────────────────────────────────────────────

export function BotGroups() {
  const { rpcUrl } = useNetwork()
  const { wallets, isLocked, getKeypairs, getPassword, generateWallets, removeWallets } = useSecureWallet({ rpcUrl })
  const { addToken } = useActiveTokens()
  const { addTrade, trades } = useTxHistory()
  const { fundStealth } = useStealthFund(rpcUrl)

  // Config state (persisted)
  const [configs, setConfigs] = useState<BotGroupConfig[]>(() => loadBotConfigs())
  // Runtime state (in-memory)
  const runtimesRef = useRef<Map<string, BotGroupRuntime>>(new Map())
  const [, setRuntimeVersion] = useState(0) // force re-render
  // Always-current refs to break stale closures in setTimeout chains
  const walletsRef = useRef(wallets)
  walletsRef.current = wallets
  const configsRef = useRef(configs)
  configsRef.current = configs

  // Per-wallet keys: `${botId}::${walletId}` — each wallet runs its own parallel trade loop
  const tradeLoopRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const isExecutingRef = useRef<Map<string, boolean>>(new Map())
  const requireBuyFirstRef = useRef<Map<string, boolean>>(new Map())
  const lastTradeAtRef = useRef<Map<string, number>>(new Map())

  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedBots, setExpandedBots] = useState<Record<string, boolean>>({})
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<BotGroupConfig>>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Create modal state
  const [newName, setNewName] = useState('')
  const [newToken, setNewToken] = useState('')
  const [newWalletCount, setNewWalletCount] = useState(5)
  const [newSolPerWallet, setNewSolPerWallet] = useState(0.1)
  const [newIntensity, setNewIntensity] = useState<BotGroupConfig['intensity']>('medium')
  const [newPattern, setNewPattern] = useState<BotGroupConfig['pattern']>('organic')
  const [newMinSwap, setNewMinSwap] = useState(0.01)
  const [newMaxSwap, setNewMaxSwap] = useState(0.1)
  const [newMinIntervalSec, setNewMinIntervalSec] = useState(30)
  const [newMaxIntervalSec, setNewMaxIntervalSec] = useState(120)
  const [newEstTxFee, setNewEstTxFee] = useState(0.00005)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const jupiterApiKey = localStorage.getItem('jupiter_api_key') || ''
  const heliusApiKey = localStorage.getItem('helius_api_key') || ''

  // Helper: get runtime (with defaults)
  const getRuntime = useCallback((botId: string): BotGroupRuntime => {
    return runtimesRef.current.get(botId) || {
      status: 'idle',
      walletIds: [],
      stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: null },
      error: null,
    }
  }, [])

  const setRuntime = useCallback((botId: string, updates: Partial<BotGroupRuntime>) => {
    const current = runtimesRef.current.get(botId) || {
      status: 'idle' as const,
      walletIds: [] as string[],
      stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: null },
      error: null,
    }
    runtimesRef.current.set(botId, { ...current, ...updates })
    setRuntimeVersion(v => v + 1)

    // Sync lightweight summary to localStorage for Dashboard card
    try {
      const summary: Record<string, { status: string; name: string; walletCount: number; swaps: number; volume: number }> = {}
      for (const [id, rt] of runtimesRef.current.entries()) {
        if (rt.status === 'idle') continue
        const cfg = configsRef.current.find(c => c.id === id)
        summary[id] = {
          status: rt.status,
          name: cfg?.name || id.slice(0, 8),
          walletCount: rt.walletIds.length,
          swaps: rt.stats.swapsExecuted,
          volume: rt.stats.totalVolumeSol,
        }
      }
      if (Object.keys(summary).length > 0) {
        localStorage.setItem(BOT_RUNTIMES_STORAGE_KEY, JSON.stringify(summary))
      } else {
        localStorage.removeItem(BOT_RUNTIMES_STORAGE_KEY)
      }
    } catch { /* ignore */ }
  }, [])

  // ── Orphan detection ───────────────────────────────────────

  const getOrphanedWalletIds = useCallback((botId: string) => {
    const config = configs.find(c => c.id === botId)
    if (!config) return []
    const prefix = `${config.name}-W`
    return wallets
      .filter(w => w.type === 'burner' && w.name.startsWith(prefix))
      .map(w => w.id)
  }, [configs, wallets])

  const hasOrphans = useCallback((botId: string) => {
    const runtime = getRuntime(botId)
    if (runtime.status !== 'idle') return false
    return getOrphanedWalletIds(botId).length > 0
  }, [getRuntime, getOrphanedWalletIds])

  // ── Config CRUD ────────────────────────────────────────────

  const handleIntensityChange = useCallback((level: BotGroupConfig['intensity']) => {
    setNewIntensity(level)
    const presets = intensityConfigs[level]
    setNewMinSwap(presets.minSwap)
    setNewMaxSwap(presets.maxSwap)
    setNewMinIntervalSec(presets.minInterval / 1000)
    setNewMaxIntervalSec(presets.maxInterval / 1000)
  }, [])

  const resetModalState = useCallback(() => {
    setNewName('')
    setNewToken('')
    setNewWalletCount(5)
    setNewSolPerWallet(0.1)
    setNewIntensity('medium')
    setNewPattern('organic')
    setNewMinSwap(0.01)
    setNewMaxSwap(0.1)
    setNewMinIntervalSec(30)
    setNewMaxIntervalSec(120)
    setNewEstTxFee(0.00005)
    setShowAdvanced(false)
  }, [])

  const createBotConfig = useCallback(() => {
    if (!newName.trim() || !newToken.trim()) return

    const newConfig: BotGroupConfig = {
      id: `bot_${Date.now().toString(36)}`,
      name: newName.trim(),
      targetToken: newToken.trim(),
      walletCount: newWalletCount,
      solPerWallet: newSolPerWallet,
      pattern: newPattern,
      intensity: newIntensity,
      minSwapSol: newMinSwap,
      maxSwapSol: newMaxSwap,
      minIntervalMs: newMinIntervalSec * 1000,
      maxIntervalMs: newMaxIntervalSec * 1000,
      createdAt: Date.now(),
    }

    const updated = [...configs, newConfig]
    setConfigs(updated)
    saveBotConfigs(updated)
    setShowCreateModal(false)
    resetModalState()
  }, [newName, newToken, newWalletCount, newSolPerWallet, newPattern, newIntensity, newMinSwap, newMaxSwap, newMinIntervalSec, newMaxIntervalSec, configs, resetModalState])

  const deleteBotConfig = useCallback((botId: string) => {
    const runtime = getRuntime(botId)
    if (runtime.status !== 'idle') return // can't delete while running
    const updated = configs.filter(c => c.id !== botId)
    setConfigs(updated)
    saveBotConfigs(updated)
    runtimesRef.current.delete(botId)
  }, [configs, getRuntime])

  // ── Trade Engine ───────────────────────────────────────────

  const executeBotTrade = useCallback(async (botId: string, walletId?: string) => {
    // Read from refs to avoid stale closures in setTimeout chains
    const config = configsRef.current.find(c => c.id === botId)
    const runtime = getRuntime(botId)
    if (!config || runtime.status !== 'running') return

    // If walletId provided, use per-wallet locking; otherwise fall back to per-bot (shouldn't happen)
    const lockKey = walletId ? `${botId}::${walletId}` : botId
    if (isExecutingRef.current.get(lockKey)) return
    isExecutingRef.current.set(lockKey, true)
    lastTradeAtRef.current.set(lockKey, Date.now())

    try {
      const allKeypairs = getKeypairs()
      if (allKeypairs.length === 0) throw new Error('No keypairs available')

      let targetMintPubkey: PublicKey
      try {
        targetMintPubkey = new PublicKey(config.targetToken)
      } catch {
        throw new Error('Invalid target token mint')
      }

      // Auto-detect DEX
      let effectiveDex: DexType = 'jupiter'
      const connection = new Connection(rpcUrl, 'confirmed')
      try {
        const bondingCurve = getBondingCurveAddress(targetMintPubkey)
        const accountInfo = await connection.getAccountInfo(bondingCurve)
        if (accountInfo && accountInfo.data && accountInfo.data.length >= 49) {
          const complete = (accountInfo.data as Buffer).readUInt8(48) === 1
          if (!complete) effectiveDex = 'pumpfun'
        }
      } catch { /* default jupiter */ }

      const swapper = getSwapper(effectiveDex)
      if (!swapper.isImplemented) throw new Error(`${swapper.name} not implemented`)
      if (effectiveDex === 'jupiter' && !jupiterApiKey) {
        throw new Error('Jupiter API key required')
      }

      const dexConfig: DexConfig = {
        rpcUrl,
        apiKey: effectiveDex === 'jupiter' ? jupiterApiKey : undefined,
        slippageBps: 200,
        heliusApiKey: heliusApiKey || undefined,
      }

      // Pick wallet — use specific wallet if provided, otherwise first (fallback)
      const targetWalletId = walletId || runtime.walletIds[0]
      const currentWallets = walletsRef.current
      const wallet = currentWallets.find(w => w.id === targetWalletId)
      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet?.address)
      if (!wallet || !signer) throw new Error('Wallet/signer not found')

      // Check wallet state
      const owner = new PublicKey(wallet.address)
      const [solLamports, tokenAccounts] = await Promise.all([
        connection.getBalance(owner, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(owner, { mint: targetMintPubkey }, 'confirmed'),
      ])

      let tokenRawBalance = 0n
      for (const account of tokenAccounts.value) {
        try {
          const tokenAmount = account.account.data.parsed.info.tokenAmount
          tokenRawBalance += BigInt(tokenAmount.amount as string)
        } catch { /* skip */ }
      }

      const spendableLamports = Math.max(0, solLamports - SOL_RESERVE_LAMPORTS)
      const minBuyLamports = Math.max(1, Math.floor(config.minSwapSol * LAMPORTS_PER_SOL))
      const canBuy = spendableLamports >= minBuyLamports
      const hasTokens = tokenRawBalance > 0n

      const requireBuy = requireBuyFirstRef.current.get(lockKey) ?? true
      const preferBuy = requireBuy || Math.random() > 0.5

      const amount = config.minSwapSol + Math.random() * (config.maxSwapSol - config.minSwapSol)
      const desiredBuyLamports = Math.max(1, Math.floor(amount * LAMPORTS_PER_SOL))

      let tradeType: 'buy' | 'sell' = 'buy'
      let inputMint: string
      let outputMint: string
      let amountRaw: number

      if (preferBuy && canBuy) {
        tradeType = 'buy'
        inputMint = WSOL
        outputMint = config.targetToken
        amountRaw = Math.max(minBuyLamports, Math.min(desiredBuyLamports, spendableLamports))
      } else if (hasTokens) {
        tradeType = 'sell'
        inputMint = config.targetToken
        outputMint = WSOL
        // Sell 25-75% of balance
        const percentage = BigInt(25 + Math.floor(Math.random() * 51))
        const sellAmount = (tokenRawBalance * percentage) / 100n
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
        amountRaw = Number(sellAmount > maxSafe ? maxSafe : (sellAmount > 0n ? sellAmount : tokenRawBalance))
      } else if (canBuy) {
        tradeType = 'buy'
        inputMint = WSOL
        outputMint = config.targetToken
        amountRaw = Math.max(minBuyLamports, Math.min(desiredBuyLamports, spendableLamports))
      } else {
        throw new Error('No executable trade: no SOL and no tokens')
      }

      const quote = await getQuote(effectiveDex, inputMint, outputMint, amountRaw, dexConfig)
      const swapResult = await dexExecuteSwap(quote, signer, dexConfig)
      if (!swapResult.success) throw new Error(swapResult.error || 'Swap failed')

      const executedAmountSol = tradeType === 'buy' ? amountRaw / LAMPORTS_PER_SOL : amount

      // Record trade
      addTrade({
        timestamp: Date.now(),
        type: tradeType,
        tokenMint: config.targetToken,
        amount: parseFloat(executedAmountSol.toFixed(4)),
        wallet: wallet.address,
        txHash: swapResult.txHash,
        status: 'success',
        source: 'volume',
      })

      if (tradeType === 'buy') {
        requireBuyFirstRef.current.set(lockKey, false)
      }

      // Update stats
      const currentStats = getRuntime(botId).stats
      setRuntime(botId, {
        stats: {
          ...currentStats,
          swapsExecuted: currentStats.swapsExecuted + 1,
          totalVolumeSol: currentStats.totalVolumeSol + parseFloat(executedAmountSol.toFixed(4)),
        },
      })
    } catch (err) {
      console.error(`Bot ${botId} wallet ${walletId} trade error:`, err)
    } finally {
      isExecutingRef.current.set(lockKey, false)
    }

    // Schedule next trade for THIS wallet
    const rt = getRuntime(botId)
    const cfg = configsRef.current.find(c => c.id === botId)
    if (rt.status === 'running' && cfg && walletId) {
      const delay = cfg.minIntervalMs + Math.random() * (cfg.maxIntervalMs - cfg.minIntervalMs)
      const timeoutId = setTimeout(() => executeBotTrade(botId, walletId), delay)
      tradeLoopRefs.current.set(lockKey, timeoutId)
    }
  }, [getRuntime, setRuntime, getKeypairs, rpcUrl, jupiterApiKey, addTrade])

  // ── START lifecycle ────────────────────────────────────────

  const startBot = useCallback(async (botId: string) => {
    const config = configs.find(c => c.id === botId)
    if (!config) return

    if (isLocked) {
      setFeedback({ type: 'error', message: 'Unlock your wallet vault first' })
      return
    }
    const pw = getPassword()
    if (!pw) {
      setFeedback({ type: 'error', message: 'Unlock your wallet vault first (password not found)' })
      return
    }

    const treasuryWallet = wallets[0]
    if (!treasuryWallet) {
      setFeedback({ type: 'error', message: 'No treasury wallet found' })
      return
    }

    const requiredSol = config.walletCount * config.solPerWallet + config.walletCount * 0.001
    if ((treasuryWallet.balance || 0) < requiredSol) {
      setFeedback({ type: 'error', message: `Treasury needs ${requiredSol.toFixed(3)} SOL (${config.walletCount} × ${config.solPerWallet} SOL + fees)` })
      return
    }

    setRuntime(botId, { status: 'starting', error: null })
    setFeedback(null)

    try {
      // 1. Generate wallets
      const newWallets = await generateWallets(
        config.walletCount,
        `${config.name}-W`,
        'burner',
        pw
      )
      const walletIds = newWallets.map(w => w.id)

      // 2. Fund wallets from treasury
      const keypairs = getKeypairs()
      const treasuryKeypair = keypairs.find(kp => kp.publicKey.toBase58() === treasuryWallet.address)
      if (!treasuryKeypair) throw new Error('Treasury keypair not found')

      if (isStealthEnabled() && isStealthAvailable()) {
        // Stealth funding via ChangeNow — breaks on-chain clustering
        const destinations = newWallets.map(w => ({
          address: w.address,
          label: w.name,
          amountSol: config.solPerWallet,
        }))
        await fundStealth(treasuryKeypair, destinations)
      } else {
        const connection = new Connection(rpcUrl, 'confirmed')
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

        const fundTx = new Transaction()
        fundTx.recentBlockhash = blockhash
        fundTx.feePayer = treasuryKeypair.publicKey

        for (const w of newWallets) {
          fundTx.add(
            SystemProgram.transfer({
              fromPubkey: treasuryKeypair.publicKey,
              toPubkey: new PublicKey(w.address),
              lamports: Math.floor(config.solPerWallet * LAMPORTS_PER_SOL),
            })
          )
        }

        fundTx.sign(treasuryKeypair)
        const sig = await connection.sendRawTransaction(fundTx.serialize(), { skipPreflight: false, maxRetries: 3 })
        await confirmTx(connection, sig, blockhash, lastValidBlockHeight)
      }

      // 3. Start parallel trade loops
      addToken({ mint: config.targetToken, source: 'volume' })

      setRuntime(botId, {
        status: 'running',
        walletIds,
        stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: Date.now() },
        error: null,
      })

      // Kick off parallel trade loops — one per wallet, staggered start
      for (let i = 0; i < walletIds.length; i++) {
        const wId = walletIds[i]
        const loopKey = `${config.id}::${wId}`
        requireBuyFirstRef.current.set(loopKey, true)
        // Stagger: wallet 0 starts after 2-5s, each subsequent wallet offset by 3-8s
        const stagger = (2000 + Math.random() * 3000) + i * (3000 + Math.random() * 5000)
        const timeoutId = setTimeout(() => executeBotTrade(config.id, wId), stagger)
        tradeLoopRefs.current.set(loopKey, timeoutId)
      }

      setFeedback({ type: 'success', message: `${config.name} started! ${config.walletCount} wallets funded with ${config.solPerWallet} SOL each` })
    } catch (err) {
      setRuntime(botId, { status: 'error', error: (err as Error).message })
      setFeedback({ type: 'error', message: (err as Error).message })
    }
  }, [configs, isLocked, getPassword, wallets, getKeypairs, rpcUrl, generateWallets, setRuntime, addToken, executeBotTrade, fundStealth])

  // ── STOP lifecycle ─────────────────────────────────────────

  const stopBot = useCallback(async (botId: string) => {
    const config = configs.find(c => c.id === botId)
    const runtime = getRuntime(botId)
    if (!config || (runtime.status !== 'running' && runtime.status !== 'error')) return

    // 1. Stop all per-wallet trade loops
    for (const walletId of runtime.walletIds) {
      const loopKey = `${botId}::${walletId}`
      const loopRef = tradeLoopRefs.current.get(loopKey)
      if (loopRef) clearTimeout(loopRef)
      tradeLoopRefs.current.delete(loopKey)
      isExecutingRef.current.delete(loopKey)
      requireBuyFirstRef.current.delete(loopKey)
      lastTradeAtRef.current.delete(loopKey)
    }

    setRuntime(botId, { status: 'stopping' })

    const connection = new Connection(rpcUrl, 'confirmed')
    const allKeypairs = getKeypairs()
    const treasuryWallet = wallets[0]
    if (!treasuryWallet) {
      setRuntime(botId, { status: 'error', error: 'No treasury wallet' })
      return
    }

    const pw = getPassword()
    if (!pw) {
      setRuntime(botId, { status: 'error', error: 'Vault password not available — unlock wallet vault first' })
      setFeedback({ type: 'error', message: 'Unlock your wallet vault first — needed to delete bot wallets' })
      return
    }

    // Result tracking
    let tokensSold = 0
    let sellErrors = 0
    let walletsSwept = 0
    let sweepErrors = 0
    let walletsDeleted = false
    const walletCount = runtime.walletIds.length
    const ghostHolders = localStorage.getItem('trench_ghost_holders') === 'true'

    console.log(`[BotGroups] stopBot ${config.name}: ${walletCount} walletIds, password present: ${!!pw}`)

    if (walletCount === 0) {
      console.warn(`[BotGroups] stopBot ${config.name}: walletIds is EMPTY — nothing to clean up`)
    }

    // 2. Sell all tokens on each bot wallet
    for (const walletId of runtime.walletIds) {
      const wallet = wallets.find(w => w.id === walletId)
      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet?.address)
      if (!wallet || !signer) {
        console.warn(`[BotGroups] stopBot: wallet or signer not found for ${walletId}, wallet=${!!wallet}, signer=${!!signer}`)
        continue
      }

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(wallet.address),
          { programId: SPL_TOKEN_PROGRAM_ID }
        )
        const holdings: WalletTokenHolding[] = tokenAccounts.value
          .map((account) => {
            const info = account.account.data.parsed.info
            const tokenAmount = info.tokenAmount
            return {
              mint: info.mint as string,
              amountRaw: tokenAmount.amount as string,
              amountUi: tokenAmount.uiAmount ?? parseFloat(tokenAmount.uiAmountString || '0'),
              decimals: tokenAmount.decimals as number,
            }
          })
          .filter(h => BigInt(h.amountRaw) > 0n && h.mint !== WSOL_MINT)

        for (const token of holdings) {
          const fullAmount = parseInt(token.amountRaw)
          const dust = Math.pow(10, token.decimals)
          const sellAmount = ghostHolders ? Math.max(0, fullAmount - dust) : fullAmount
          if (sellAmount <= 0) continue

          try {
            // Try Jupiter first
            const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
              inputMint: token.mint,
              outputMint: WSOL_MINT,
              amount: String(sellAmount),
              slippageBps: '200',
            })
            const quoteResponse = await fetch(quoteUrl, {
              headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {},
            })
            if (!quoteResponse.ok) throw new Error('Jupiter quote failed')

            const quote = await quoteResponse.json()
            const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}),
              },
              body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: signer.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto',
              }),
            })
            if (!swapResponse.ok) throw new Error('Jupiter swap failed')

            const swapPayload = await swapResponse.json()
            const transactionBuffer = Buffer.from(swapPayload.swapTransaction, 'base64')
            const transaction = VersionedTransaction.deserialize(transactionBuffer)
            transaction.sign([signer])

            const signature = await connection.sendTransaction(transaction, {
              skipPreflight: false,
              maxRetries: 3,
            })
            await confirmTx(connection, signature)
            tokensSold++

            addTrade({
              timestamp: Date.now(),
              type: 'sell',
              tokenMint: token.mint,
              amount: token.amountUi,
              wallet: wallet.address,
              txHash: signature,
              status: 'success',
              source: 'volume',
            })
          } catch (jupErr) {
            // Fallback: PumpFun sell
            try {
              const pfConfig: DexConfig = { rpcUrl, slippageBps: 200, heliusApiKey: heliusApiKey || undefined }
              const pfQuote = await dexGetQuote('pumpfun', token.mint, WSOL_MINT, sellAmount, pfConfig)
              const pfResult = await dexExecuteSwap(pfQuote, signer, pfConfig)
              if (pfResult.success) {
                tokensSold++
                addTrade({
                  timestamp: Date.now(),
                  type: 'sell',
                  tokenMint: token.mint,
                  amount: token.amountUi,
                  wallet: wallet.address,
                  txHash: pfResult.txHash,
                  status: 'success',
                  source: 'volume',
                })
              } else {
                sellErrors++
                console.error(`[BotGroups] PumpFun sell failed for ${token.mint}:`, pfResult.error)
              }
            } catch (pfErr) {
              sellErrors++
              console.error(`[BotGroups] Failed to sell ${token.mint} (Jupiter + PumpFun):`, jupErr, pfErr)
            }
          }
        }
      } catch (err) {
        sellErrors++
        console.error(`[BotGroups] Failed to scan tokens on ${wallet.address}:`, err)
      }
    }

    // 3. Verify on-chain: which wallets are actually empty (safe to delete)?
    //    Wallets that still hold tokens keep their keys so they can be retried via Clean Up.
    const safeToDelete: string[] = []
    const keptWallets: string[] = []

    for (const walletId of runtime.walletIds) {
      const wallet = wallets.find(w => w.id === walletId)
      if (!wallet) {
        safeToDelete.push(walletId) // can't find wallet metadata, safe to prune
        continue
      }

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(wallet.address),
          { programId: SPL_TOKEN_PROGRAM_ID }
        )
        const remainingTokens = tokenAccounts.value.filter(a => {
          const info = a.account.data.parsed.info
          if (info.mint === WSOL_MINT) return false
          const bal = BigInt(info.tokenAmount.amount)
          if (ghostHolders) return bal > 10n ** BigInt(info.tokenAmount.decimals)
          return bal > 0n
        })

        if (remainingTokens.length === 0) {
          safeToDelete.push(walletId)
        } else {
          keptWallets.push(walletId)
          console.warn(`[BotGroups] Wallet ${wallet.address} still holds ${remainingTokens.length} token(s) — keeping keys`)
        }
      } catch (err) {
        // Can't verify balance — keep wallet to be safe
        keptWallets.push(walletId)
        console.error(`[BotGroups] Failed to verify ${wallet.address}, keeping keys:`, err)
      }
    }

    // 4. Sweep SOL to treasury (only from verified-empty wallets)
    //    Wallets with remaining tokens keep their SOL for future sell tx fees.
    for (const walletId of safeToDelete) {
      const wallet = wallets.find(w => w.id === walletId)
      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet?.address)
      if (!wallet || !signer) {
        sweepErrors++
        console.warn(`[BotGroups] sweep: wallet or signer not found for ${walletId}`)
        continue
      }

      try {
        const lamports = await connection.getBalance(signer.publicKey)
        const sweepLamports = lamports - 5000 // leave enough for tx fee
        if (sweepLamports > 0) {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: signer.publicKey,
              toPubkey: new PublicKey(treasuryWallet.address),
              lamports: sweepLamports,
            })
          )
          tx.recentBlockhash = blockhash
          tx.feePayer = signer.publicKey
          tx.sign(signer)
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
          await confirmTx(connection, sig, blockhash, lastValidBlockHeight)
          walletsSwept++
          console.log(`[BotGroups] Swept ${sweepLamports / LAMPORTS_PER_SOL} SOL from ${wallet.name}`)
        } else {
          walletsSwept++ // nothing to sweep, counts as success
        }
      } catch (err) {
        sweepErrors++
        console.error(`[BotGroups] Failed to sweep ${wallet.address}:`, err)
      }
    }

    // 5. Protect launch wallets — never auto-delete wallets that launched tokens
    //    (destroying the keypair permanently prevents claiming creator fees)
    const { safeIds: deletableIds, protectedIds: launchProtectedIds, protectedDetails: launchDetails } =
      filterLaunchWallets(safeToDelete, wallets)

    if (launchProtectedIds.length > 0) {
      keptWallets.push(...launchProtectedIds)
      console.warn(`[BotGroups] Protected ${launchProtectedIds.length} launch wallet(s) from deletion:`, launchDetails)
    }

    // 6. Delete only safe, non-launch wallets from vault
    try {
      if (deletableIds.length > 0) {
        await removeWallets(deletableIds, pw)
        walletsDeleted = true
        console.log(`[BotGroups] Deleted ${deletableIds.length}/${walletCount} bot wallets from vault`)
      } else if (keptWallets.length === 0) {
        walletsDeleted = true // nothing to delete
      }
    } catch (err) {
      console.error('[BotGroups] Failed to delete bot wallets:', err)
    }

    if (keptWallets.length > 0) {
      console.warn(`[BotGroups] Kept ${keptWallets.length} wallet(s) — use Clean Up to retry`)
    }

    // 6. Reset runtime — preserve kept wallets so Clean Up can find them
    setRuntime(botId, {
      status: 'idle',
      walletIds: keptWallets,
      stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: null },
      error: keptWallets.length > 0 ? `${keptWallets.length} wallet(s) still hold unsold tokens` : null,
    })

    // 7. Build accurate feedback message
    const parts: string[] = [`${config.name} stopped.`]
    if (tokensSold > 0) parts.push(`${tokensSold} token(s) sold.`)
    if (sellErrors > 0) parts.push(`${sellErrors} sell error(s).`)
    if (walletsSwept > 0 && sweepErrors === 0) parts.push('SOL swept.')
    else if (sweepErrors > 0) parts.push(`Sweep: ${walletsSwept}/${safeToDelete.length} ok, ${sweepErrors} failed.`)
    if (deletableIds.length > 0 && walletsDeleted) parts.push(`${deletableIds.length} wallet(s) deleted.`)
    if (launchProtectedIds.length > 0) parts.push(`${launchProtectedIds.length} launch wallet(s) protected (creator fees).`)
    if (keptWallets.length > 0) parts.push(`${keptWallets.length} wallet(s) kept — use Clean Up.`)
    else if (!walletsDeleted && keptWallets.length === 0) parts.push('Wallet deletion failed — use Clean Up.')

    const hasErrors = sellErrors > 0 || sweepErrors > 0 || keptWallets.length > 0
    setFeedback({ type: hasErrors ? 'error' : 'success', message: parts.join(' ') })
  }, [configs, getRuntime, setRuntime, wallets, getKeypairs, rpcUrl, getPassword, removeWallets, jupiterApiKey, addTrade])

  // ── RESUME lifecycle (reuse orphaned wallets) ─────────────

  const resumeBot = useCallback((botId: string) => {
    const config = configs.find(c => c.id === botId)
    if (!config) return

    const orphanIds = getOrphanedWalletIds(botId)
    if (orphanIds.length === 0) {
      setFeedback({ type: 'error', message: 'No orphaned wallets found to resume' })
      return
    }

    if (isLocked) {
      setFeedback({ type: 'error', message: 'Unlock your wallet vault first' })
      return
    }

    addToken({ mint: config.targetToken, source: 'volume' })

    setRuntime(botId, {
      status: 'running',
      walletIds: orphanIds,
      stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: Date.now() },
      error: null,
    })

    // Kick off parallel trade loops — one per wallet, staggered start
    for (let i = 0; i < orphanIds.length; i++) {
      const wId = orphanIds[i]
      const loopKey = `${botId}::${wId}`
      requireBuyFirstRef.current.set(loopKey, true)
      const stagger = (2000 + Math.random() * 3000) + i * (3000 + Math.random() * 5000)
      const timeoutId = setTimeout(() => executeBotTrade(botId, wId), stagger)
      tradeLoopRefs.current.set(loopKey, timeoutId)
    }

    setFeedback({ type: 'success', message: `${config.name} resumed with ${orphanIds.length} existing wallets` })
  }, [configs, getOrphanedWalletIds, isLocked, addToken, setRuntime, executeBotTrade])

  // ── Cleanup orphaned wallets ───────────────────────────────

  const cleanupOrphans = useCallback(async (botId: string) => {
    const config = configs.find(c => c.id === botId)
    if (!config) return

    const orphanIds = getOrphanedWalletIds(botId)
    if (orphanIds.length === 0) return

    const pw = getPassword()
    if (!pw) {
      setFeedback({ type: 'error', message: 'Unlock your wallet vault first — needed to clean up wallets' })
      return
    }

    setRuntime(botId, { status: 'stopping' })

    const connection = new Connection(rpcUrl, 'confirmed')
    const allKeypairs = getKeypairs()
    const treasuryWallet = wallets[0]

    let walletsSwept = 0
    let sweepErrors = 0
    let walletsDeleted = false
    const ghostHolders = localStorage.getItem('trench_ghost_holders') === 'true'

    // Sell tokens + sweep SOL for each orphaned wallet
    for (const walletId of orphanIds) {
      const wallet = wallets.find(w => w.id === walletId)
      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet?.address)
      if (!wallet || !signer) {
        console.warn(`[BotGroups] cleanup: wallet or signer not found for ${walletId}`)
        sweepErrors++
        continue
      }

      // Sell tokens
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(wallet.address),
          { programId: SPL_TOKEN_PROGRAM_ID }
        )
        const holdings = tokenAccounts.value
          .map((account) => {
            const info = account.account.data.parsed.info
            const tokenAmount = info.tokenAmount
            return {
              mint: info.mint as string,
              amountRaw: tokenAmount.amount as string,
              amountUi: tokenAmount.uiAmount ?? parseFloat(tokenAmount.uiAmountString || '0'),
              decimals: tokenAmount.decimals as number,
            }
          })
          .filter(h => BigInt(h.amountRaw) > 0n && h.mint !== WSOL_MINT)

        for (const token of holdings) {
          const fullAmount = parseInt(token.amountRaw)
          const dust = Math.pow(10, token.decimals)
          const sellAmount = ghostHolders ? Math.max(0, fullAmount - dust) : fullAmount
          if (sellAmount <= 0) continue

          try {
            const pfConfig: DexConfig = { rpcUrl, slippageBps: 200, heliusApiKey: heliusApiKey || undefined }
            const pfQuote = await dexGetQuote('pumpfun', token.mint, WSOL_MINT, sellAmount, pfConfig)
            const pfResult = await dexExecuteSwap(pfQuote, signer, pfConfig)
            if (!pfResult.success) throw new Error('PumpFun sell failed')
          } catch {
            try {
              const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
                inputMint: token.mint,
                outputMint: WSOL_MINT,
                amount: String(sellAmount),
                slippageBps: '200',
              })
              const quoteResponse = await fetch(quoteUrl, {
                headers: jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {},
              })
              if (quoteResponse.ok) {
                const quote = await quoteResponse.json()
                const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(jupiterApiKey ? { 'x-api-key': jupiterApiKey } : {}),
                  },
                  body: JSON.stringify({
                    quoteResponse: quote,
                    userPublicKey: signer.publicKey.toBase58(),
                    wrapAndUnwrapSol: true,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto',
                  }),
                })
                if (swapResponse.ok) {
                  const swapPayload = await swapResponse.json()
                  const txBuf = Buffer.from(swapPayload.swapTransaction, 'base64')
                  const vTx = VersionedTransaction.deserialize(txBuf)
                  vTx.sign([signer])
                  const sig = await connection.sendTransaction(vTx, { skipPreflight: false, maxRetries: 3 })
                  await confirmTx(connection, sig)
                }
              }
            } catch (err) {
              console.error(`[BotGroups] cleanup sell failed for ${token.mint}:`, err)
            }
          }
        }
      } catch (err) {
        console.error(`[BotGroups] cleanup token scan failed on ${wallet.address}:`, err)
      }

    }

    // Verify on-chain: which orphaned wallets are actually empty?
    const safeToDelete: string[] = []
    const keptOrphans: string[] = []

    for (const walletId of orphanIds) {
      const wallet = wallets.find(w => w.id === walletId)
      if (!wallet) {
        safeToDelete.push(walletId)
        continue
      }

      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          new PublicKey(wallet.address),
          { programId: SPL_TOKEN_PROGRAM_ID }
        )
        const remainingTokens = tokenAccounts.value.filter(a => {
          const info = a.account.data.parsed.info
          if (info.mint === WSOL_MINT) return false
          const bal = BigInt(info.tokenAmount.amount)
          if (ghostHolders) return bal > 10n ** BigInt(info.tokenAmount.decimals)
          return bal > 0n
        })

        if (remainingTokens.length === 0) {
          safeToDelete.push(walletId)
        } else {
          keptOrphans.push(walletId)
          console.warn(`[BotGroups] cleanup: wallet ${wallet.address} still holds ${remainingTokens.length} token(s) — keeping keys`)
        }
      } catch (err) {
        keptOrphans.push(walletId)
        console.error(`[BotGroups] cleanup: failed to verify ${wallet.address}, keeping keys:`, err)
      }
    }

    // Sweep SOL only from verified-empty wallets
    for (const walletId of safeToDelete) {
      const wallet = wallets.find(w => w.id === walletId)
      const signer = allKeypairs.find(kp => kp.publicKey.toBase58() === wallet?.address)
      if (!wallet || !signer || !treasuryWallet) {
        sweepErrors++
        continue
      }

      try {
        const lamports = await connection.getBalance(signer.publicKey)
        const sweepLamports = lamports - 5000
        if (sweepLamports > 0) {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: signer.publicKey,
              toPubkey: new PublicKey(treasuryWallet.address),
              lamports: sweepLamports,
            })
          )
          tx.recentBlockhash = blockhash
          tx.feePayer = signer.publicKey
          tx.sign(signer)
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 })
          await confirmTx(connection, sig, blockhash, lastValidBlockHeight)
          walletsSwept++
        } else {
          walletsSwept++
        }
      } catch (err) {
        sweepErrors++
        console.error(`[BotGroups] cleanup sweep failed on ${wallet.address}:`, err)
      }
    }

    // Protect launch wallets from deletion
    const { safeIds: cleanupDeletable, protectedIds: cleanupProtected, protectedDetails: cleanupLaunchDetails } =
      filterLaunchWallets(safeToDelete, wallets)

    if (cleanupProtected.length > 0) {
      keptOrphans.push(...cleanupProtected)
      console.warn(`[BotGroups] cleanup: protected ${cleanupProtected.length} launch wallet(s):`, cleanupLaunchDetails)
    }

    // Delete only verified-empty, non-launch orphaned wallets
    try {
      if (cleanupDeletable.length > 0) {
        await removeWallets(cleanupDeletable, pw)
        walletsDeleted = true
      }
    } catch (err) {
      console.error('[BotGroups] cleanup: failed to delete wallets:', err)
    }

    setRuntime(botId, {
      status: 'idle',
      walletIds: keptOrphans,
      stats: { swapsExecuted: 0, totalVolumeSol: 0, startedAt: null },
      error: keptOrphans.length > 0 ? `${keptOrphans.length} wallet(s) still hold unsold tokens` : null,
    })

    const parts: string[] = [`Cleaned up orphaned wallets from ${config.name}.`]
    if (cleanupDeletable.length > 0 && walletsDeleted) parts.push(`${cleanupDeletable.length} wallet(s) deleted.`)
    if (walletsSwept > 0) parts.push('SOL swept.')
    if (sweepErrors > 0) parts.push(`Sweep: ${walletsSwept}/${safeToDelete.length} ok.`)
    if (cleanupProtected.length > 0) parts.push(`${cleanupProtected.length} launch wallet(s) protected (creator fees).`)
    if (keptOrphans.length > 0) parts.push(`${keptOrphans.length} wallet(s) kept — retry Clean Up.`)
    if (!walletsDeleted && cleanupDeletable.length > 0) parts.push('Wallet deletion failed.')
    const hasErrors = sweepErrors > 0 || !walletsDeleted || keptOrphans.length > 0
    setFeedback({ type: hasErrors ? 'error' : 'success', message: parts.join(' ') })
  }, [configs, getOrphanedWalletIds, wallets, getKeypairs, rpcUrl, getPassword, removeWallets, setRuntime, jupiterApiKey])

  // ── Visibility resume (same as VolumeControl) ──────────────

  useEffect(() => {
    const runningBots = configs.filter(c => getRuntime(c.id).status === 'running')
    if (runningBots.length === 0) return

    const handleResume = () => {
      if (document.visibilityState !== 'visible') return

      for (const config of runningBots) {
        const runtime = getRuntime(config.id)
        const staleThreshold = Math.max(config.maxIntervalMs * 2, 60000)

        // Restart stale per-wallet trade loops
        for (const wId of runtime.walletIds) {
          const loopKey = `${config.id}::${wId}`
          const lastAt = lastTradeAtRef.current.get(loopKey)
          if (!lastAt || Date.now() - lastAt >= staleThreshold) {
            const existing = tradeLoopRefs.current.get(loopKey)
            if (existing) clearTimeout(existing)
            const delay = config.minIntervalMs + Math.random() * (config.maxIntervalMs - config.minIntervalMs)
            const tid = setTimeout(() => executeBotTrade(config.id, wId), delay)
            tradeLoopRefs.current.set(loopKey, tid)
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)
    return () => {
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
    }
  }, [configs, getRuntime, executeBotTrade])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const [, timeoutId] of tradeLoopRefs.current) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  // ── Helpers ────────────────────────────────────────────────

  const formatUptime = (startedAt: number | null) => {
    if (!startedAt) return '--'
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`
  }

  const getStatusColor = (status: BotGroupRuntime['status']) => {
    switch (status) {
      case 'running': return 'bg-emerald-500'
      case 'starting': return 'bg-yellow-500 animate-pulse'
      case 'stopping': return 'bg-orange-500 animate-pulse'
      case 'error': return 'bg-red-500'
      default: return 'bg-slate-500'
    }
  }

  const getStatusText = (status: BotGroupRuntime['status']) => {
    switch (status) {
      case 'running': return 'Running'
      case 'starting': return 'Starting...'
      case 'stopping': return 'Stopping...'
      case 'error': return 'Error'
      default: return 'Idle'
    }
  }

  // ── Aggregated stats ───────────────────────────────────────

  const activeCount = configs.filter(c => getRuntime(c.id).status === 'running').length
  const totalSwaps = configs.reduce((sum, c) => sum + getRuntime(c.id).stats.swapsExecuted, 0)
  const totalVolume = configs.reduce((sum, c) => sum + getRuntime(c.id).stats.totalVolumeSol, 0)

  // Force re-render for uptime tickers
  const [, setTick] = useState(0)
  useEffect(() => {
    if (activeCount === 0) return
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [activeCount])

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
              <p className="text-sm text-slate-400">Active Bots</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalSwaps}</p>
              <p className="text-sm text-slate-400">Total Swaps</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalVolume.toFixed(2)}</p>
              <p className="text-sm text-slate-400">Volume (SOL)</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {configs.reduce((sum, c) => sum + getRuntime(c.id).walletIds.length, 0)}
              </p>
              <p className="text-sm text-slate-400">Bot Wallets</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vault lock warning */}
      {isLocked && (
        <div className="flex items-center gap-2 p-3 rounded-lg border text-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4 h-4" />
          Unlock your wallet vault first
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {feedback.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.message}
        </div>
      )}

      {/* Bot Group Cards */}
      {configs.length === 0 ? (
        <div className="bg-slate-900 rounded-xl p-12 border border-slate-800 text-center">
          <Bot className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Bot Groups Yet</h3>
          <p className="text-slate-400 text-sm mb-6">
            Create automated bot groups that generate wallets, run volume, and clean up on stop.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors"
          >
            Create First Bot Group
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map(config => {
            const runtime = getRuntime(config.id)
            const isExpanded = expandedBots[config.id]
            const orphaned = hasOrphans(config.id)
            const orphanCount = getOrphanedWalletIds(config.id).length
            const botWallets = wallets.filter(w => runtime.walletIds.includes(w.id))

            return (
              <div key={config.id} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                {/* Card Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(runtime.status)}`} />
                      <h3 className="text-lg font-bold text-white">{config.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        runtime.status === 'running'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : runtime.status === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : runtime.status === 'starting' || runtime.status === 'stopping'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {getStatusText(runtime.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {runtime.status === 'idle' && !orphaned && (
                        <button
                          onClick={() => startBot(config.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Start
                        </button>
                      )}
                      {orphaned && runtime.status === 'idle' && (
                        <>
                          <button
                            onClick={() => resumeBot(config.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Resume ({orphanCount})
                          </button>
                          <button
                            onClick={() => cleanupOrphans(config.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            Clean up
                          </button>
                        </>
                      )}
                      {(runtime.status === 'running' || runtime.status === 'error') && (
                        <button
                          onClick={() => stopBot(config.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Stop
                        </button>
                      )}
                      {runtime.status === 'idle' && !orphaned && editingBotId !== config.id && (
                        <button
                          onClick={() => {
                            setEditingBotId(config.id)
                            setEditDraft({
                              pattern: config.pattern,
                              minSwapSol: config.minSwapSol,
                              maxSwapSol: config.maxSwapSol,
                              minIntervalMs: config.minIntervalMs,
                              maxIntervalMs: config.maxIntervalMs,
                              solPerWallet: config.solPerWallet,
                            })
                          }}
                          className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {runtime.status === 'idle' && !orphaned && editingBotId !== config.id && (
                        <button
                          onClick={() => deleteBotConfig(config.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {editingBotId === config.id && (
                        <>
                          <button
                            onClick={() => {
                              const updated = configs.map(c => c.id === config.id ? { ...c, ...editDraft } : c) as BotGroupConfig[]
                              setConfigs(updated)
                              saveBotConfigs(updated)
                              setEditingBotId(null)
                              setFeedback({ type: 'success', message: `${config.name} updated` })
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Save
                          </button>
                          <button
                            onClick={() => setEditingBotId(null)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </>
                      )}
                      {(runtime.status === 'starting' || runtime.status === 'stopping') && (
                        <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                      )}
                    </div>
                  </div>

                  {/* Config summary / edit mode */}
                  {editingBotId === config.id ? (
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-slate-500 text-xs">Token</span>
                          <p className="text-white font-mono text-xs mt-0.5">{config.targetToken.slice(0, 8)}...{config.targetToken.slice(-4)}</p>
                        </div>
                        <div>
                          <span className="text-slate-500 text-xs">Wallets</span>
                          <p className="text-white text-xs mt-0.5">{config.walletCount} (fixed after creation)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">SOL per Wallet</label>
                          <input type="number" step="0.01" min="0.01"
                            value={editDraft.solPerWallet ?? config.solPerWallet}
                            onChange={e => setEditDraft(d => ({ ...d, solPerWallet: parseFloat(e.target.value) || 0.1 }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Pattern</label>
                          <select
                            value={editDraft.pattern ?? config.pattern}
                            onChange={e => setEditDraft(d => ({ ...d, pattern: e.target.value as BotGroupConfig['pattern'] }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          >
                            <option value="organic">Organic</option>
                            <option value="steady">Steady</option>
                            <option value="burst">Burst</option>
                            <option value="wave">Wave</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Min Swap (SOL)</label>
                          <input type="number" step="0.001" min="0.001"
                            value={editDraft.minSwapSol ?? config.minSwapSol}
                            onChange={e => setEditDraft(d => ({ ...d, minSwapSol: parseFloat(e.target.value) || 0.01 }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Max Swap (SOL)</label>
                          <input type="number" step="0.001" min="0.001"
                            value={editDraft.maxSwapSol ?? config.maxSwapSol}
                            onChange={e => setEditDraft(d => ({ ...d, maxSwapSol: parseFloat(e.target.value) || 0.1 }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Min Interval (s)</label>
                          <input type="number" step="1" min="5"
                            value={(editDraft.minIntervalMs ?? config.minIntervalMs) / 1000}
                            onChange={e => setEditDraft(d => ({ ...d, minIntervalMs: (parseInt(e.target.value) || 15) * 1000 }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Max Interval (s)</label>
                          <input type="number" step="1" min="5"
                            value={(editDraft.maxIntervalMs ?? config.maxIntervalMs) / 1000}
                            onChange={e => setEditDraft(d => ({ ...d, maxIntervalMs: (parseInt(e.target.value) || 60) * 1000 }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Token</span>
                        <p className="text-white font-mono text-xs mt-0.5">{config.targetToken.slice(0, 8)}...{config.targetToken.slice(-4)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Wallets</span>
                        <p className="text-white mt-0.5">{config.walletCount} × {config.solPerWallet} SOL</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Pattern</span>
                        <p className="text-white mt-0.5">{config.pattern.charAt(0).toUpperCase() + config.pattern.slice(1)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Swap / Interval</span>
                        <p className="text-white mt-0.5">{config.minSwapSol}-{config.maxSwapSol} SOL / {(config.minIntervalMs / 1000)}s-{(config.maxIntervalMs / 1000)}s</p>
                      </div>
                    </div>
                  )}

                  {/* Live stats when running */}
                  {runtime.status === 'running' && (
                    <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-800">
                      <div className="text-center">
                        <p className="text-lg font-bold text-emerald-400">{runtime.stats.swapsExecuted}</p>
                        <p className="text-xs text-slate-500">Swaps</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-400">{runtime.stats.totalVolumeSol.toFixed(3)}</p>
                        <p className="text-xs text-slate-500">Volume (SOL)</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-orange-400">{formatUptime(runtime.stats.startedAt)}</p>
                        <p className="text-xs text-slate-500">Uptime</p>
                      </div>
                    </div>
                  )}

                  {/* Error display */}
                  {runtime.error && (
                    <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                      {runtime.error}
                    </div>
                  )}
                </div>

                {/* Expandable details: Wallets + Recent Trades */}
                {(runtime.walletIds.length > 0 || orphaned || runtime.stats.swapsExecuted > 0) && (
                  <div className="border-t border-slate-800">
                    <button
                      onClick={() => setExpandedBots(prev => ({ ...prev, [config.id]: !prev[config.id] }))}
                      className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      <span>Details</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {isExpanded && (() => {
                      const displayWallets = botWallets.length > 0 ? botWallets : wallets.filter(w => getOrphanedWalletIds(config.id).includes(w.id))
                      const walletAddrs = new Set(displayWallets.map(w => w.address))
                      const botTrades = trades
                        .filter(t => t.tokenMint === config.targetToken && t.status === 'success' && walletAddrs.has(t.wallet))
                        .slice(0, 20)
                      const walletNameMap = new Map(displayWallets.map(w => [w.address, w.name]))

                      return (
                        <div className="px-4 pb-3 space-y-3">
                          {/* Wallets */}
                          {displayWallets.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500 font-medium mb-1.5">Wallets ({displayWallets.length})</p>
                              <div className="space-y-1">
                                {displayWallets.map(w => (
                                  <div key={w.id} className="flex items-center justify-between py-1.5 px-3 bg-slate-800/50 rounded-lg text-xs">
                                    <span className="text-slate-300 font-medium">{w.name}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-slate-500 font-mono">{w.address.slice(0, 6)}...{w.address.slice(-4)}</span>
                                      <span className="text-emerald-400 font-medium">{(w.balance || 0).toFixed(4)} SOL</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recent Trades */}
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1.5">Recent Trades{botTrades.length > 0 ? ` (${botTrades.length})` : ''}</p>
                            {botTrades.length === 0 ? (
                              <p className="text-xs text-slate-600 px-3 py-2">No trades yet</p>
                            ) : (
                              <div className="space-y-1 max-h-60 overflow-y-auto">
                                {botTrades.map(trade => (
                                  <div key={trade.id} className="flex items-center justify-between py-1.5 px-3 bg-slate-800/50 rounded-lg text-xs">
                                    <div className="flex items-center gap-2">
                                      {trade.type === 'buy' ? (
                                        <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                                      )}
                                      <span className={trade.type === 'buy' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                                        {trade.type === 'buy' ? 'Buy' : 'Sell'}
                                      </span>
                                      <span className="text-white font-medium">{trade.amount.toFixed(4)} SOL</span>
                                      <span className="text-slate-500">{walletNameMap.get(trade.wallet) || trade.wallet.slice(0, 6)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-500">{formatTimeAgo(trade.timestamp)}</span>
                                      {trade.txHash && (
                                        <a
                                          href={`https://solscan.io/tx/${trade.txHash}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-slate-500 hover:text-blue-400 transition-colors"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Bot Group button */}
      {configs.length > 0 && configs.length < MAX_BOT_GROUPS && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full py-3 border-2 border-dashed border-slate-700 hover:border-purple-500/50 rounded-xl text-slate-400 hover:text-purple-400 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Bot Group ({configs.length}/{MAX_BOT_GROUPS})
        </button>
      )}

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">Create Bot Group</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Bot Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                  placeholder="e.g., PumpBot Alpha"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Target Token (CA)</label>
                <input
                  type="text"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg font-mono text-xs"
                  placeholder="Token mint address..."
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Wallets</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={newWalletCount}
                    onChange={(e) => setNewWalletCount(parseInt(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="text-lg font-bold text-white w-8 text-center">{newWalletCount}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">SOL per Wallet</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={newSolPerWallet}
                  onChange={(e) => setNewSolPerWallet(parseFloat(e.target.value) || 0.01)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Total: {(newWalletCount * newSolPerWallet).toFixed(2)} SOL from treasury
                </p>
              </div>

              {/* Intensity Preset */}
              <div>
                <label className="text-sm text-slate-400">Intensity</label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {(['low', 'medium', 'high', 'aggressive'] as const).map(level => (
                    <button
                      key={level}
                      onClick={() => handleIntensityChange(level)}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                        newIntensity === level
                          ? level === 'aggressive'
                            ? 'bg-red-500/20 border-red-500 text-red-400'
                            : 'bg-purple-500/20 border-purple-500 text-purple-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {newIntensity === 'low' && '0.005-0.02 SOL, 2-5 min intervals'}
                  {newIntensity === 'medium' && '0.01-0.1 SOL, 30s-2 min intervals'}
                  {newIntensity === 'high' && '0.05-0.2 SOL, 15-60s intervals'}
                  {newIntensity === 'aggressive' && '0.1-0.5 SOL, 5-30s intervals'}
                </p>
              </div>

              {/* Trading Pattern */}
              <div>
                <label className="text-sm text-slate-400">Trading Pattern</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {([
                    { key: 'organic' as const, label: 'Organic', desc: 'Natural-looking volume with varied timing and sizes' },
                    { key: 'steady' as const, label: 'Steady', desc: 'Consistent volume throughout the day' },
                    { key: 'burst' as const, label: 'Burst', desc: 'Concentrated bursts of activity with quiet periods' },
                    { key: 'wave' as const, label: 'Wave', desc: 'Gradual increases and decreases in activity' },
                  ]).map(p => (
                    <button
                      key={p.key}
                      onClick={() => setNewPattern(p.key)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        newPattern === p.key
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-sm font-medium block">{p.label}</span>
                      <span className="text-xs opacity-70 block mt-0.5">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Settings */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Advanced Settings
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Min Swap (SOL)</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={newMinSwap}
                          onChange={(e) => setNewMinSwap(parseFloat(e.target.value) || 0.001)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Max Swap (SOL)</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={newMaxSwap}
                          onChange={(e) => setNewMaxSwap(parseFloat(e.target.value) || 0.001)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Min Interval (sec)</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={newMinIntervalSec}
                          onChange={(e) => setNewMinIntervalSec(parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Max Interval (sec)</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={newMaxIntervalSec}
                          onChange={(e) => setNewMaxIntervalSec(parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Est. TX Fee (SOL)</label>
                      <input
                        type="number"
                        step="0.00001"
                        min="0"
                        value={newEstTxFee}
                        onChange={(e) => setNewEstTxFee(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowCreateModal(false); resetModalState(); }}
                  className="flex-1 py-2 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createBotConfig}
                  disabled={!newName.trim() || !newToken.trim()}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
