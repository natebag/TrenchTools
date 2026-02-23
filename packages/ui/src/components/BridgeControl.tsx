/**
 * BridgeControl - Cross-Chain Bridge via Li.Fi
 * TrenchSniper OS
 *
 * Allows users to bridge native tokens between supported chains
 * (Solana, BSC, Base, SUI) using the Li.Fi aggregator.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowRightLeft,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Clock,
  X,
  ArrowDownUp,
  Zap,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { useToast } from './Toast';
import {
  type ChainId,
  ACTIVE_CHAIN_IDS,
  CHAINS,
  getNativeToken,
  getNativeDecimals,
  getExplorerUrl,
  getChainFamily,
  LifiClient,
  type BridgeQuote,
  type BridgeQuoteRequest,
  BridgeStatus,
  signAndSendBridgeTx,
} from '@trenchtools/core';

// ============ Types ============

type BridgeStep = 'idle' | 'quoting' | 'quoted' | 'signing' | 'polling' | 'done' | 'failed';

interface BridgeHistoryEntry {
  fromChain: ChainId;
  toChain: ChainId;
  amount: string;
  txHash: string;
  receiveTxHash?: string;
  tool: string;
  timestamp: number;
  status: 'pending' | 'done' | 'failed';
}

// ============ Constants ============

const BRIDGE_HISTORY_KEY = 'trench_bridge_history';
const MAX_HISTORY = 50;
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 120; // 20 minutes

const AMOUNT_PRESETS: Record<ChainId, number[]> = {
  solana: [0.1, 0.25, 0.5, 1.0],
  bsc: [0.01, 0.05, 0.1, 0.25],
  base: [0.005, 0.01, 0.025, 0.05],
  polygon: [1, 5, 10, 25],
  sui: [1, 5, 10, 25],
};

// ============ Helpers ============

function loadBridgeHistory(): BridgeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(BRIDGE_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BridgeHistoryEntry[];
  } catch {
    return [];
  }
}

function saveBridgeHistory(entries: BridgeHistoryEntry[]) {
  const capped = entries.slice(0, MAX_HISTORY);
  localStorage.setItem(BRIDGE_HISTORY_KEY, JSON.stringify(capped));
}

function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function formatAmount(raw: string, decimals: number): string {
  const num = Number(raw) / Math.pow(10, decimals);
  if (num < 0.0001) return num.toExponential(2);
  return num.toFixed(Math.min(6, decimals));
}

function toSmallestUnit(human: string, decimals: number): string {
  const num = parseFloat(human);
  if (isNaN(num) || num <= 0) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

function formatUSD(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num === 0) return '$0.00';
  if (num < 0.01) return '<$0.01';
  return `$${num.toFixed(2)}`;
}

// ============ Component ============

export function BridgeControl() {
  const { rpcUrl } = useNetwork();
  const { wallets, getKeypairs, isLocked } = useSecureWallet({ rpcUrl });
  const toast = useToast();

  // --- Chain Selection ---
  const [fromChain, setFromChain] = useState<ChainId>('solana');
  const [toChain, setToChain] = useState<ChainId>('base');

  // --- Amount ---
  const [amount, setAmount] = useState('');

  // --- Wallet Selection ---
  const [fromWallet, setFromWallet] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [toAddressIsManual, setToAddressIsManual] = useState(false);

  // --- Quote ---
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [step, setStep] = useState<BridgeStep>('idle');
  const [statusText, setStatusText] = useState('');

  // --- Result ---
  const [txHash, setTxHash] = useState<string | null>(null);
  const [receiveTxHash, setReceiveTxHash] = useState<string | null>(null);
  const [bridgeTool, setBridgeTool] = useState('');

  // --- History ---
  const [history, setHistory] = useState<BridgeHistoryEntry[]>([]);

  // --- Error ---
  const [error, setError] = useState<string | null>(null);

  // --- Refs for polling ---
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lifiClientRef = useRef(new LifiClient());

  // Load history on mount
  useEffect(() => {
    setHistory(loadBridgeHistory());
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Auto-select first wallet when wallets change
  useEffect(() => {
    if (wallets.length > 0 && !fromWallet) {
      setFromWallet(wallets[0].address);
    }
  }, [wallets, fromWallet]);

  // Auto-set toAddress when toChain or wallets change (pick first wallet)
  useEffect(() => {
    if (!toAddressIsManual && wallets.length > 0) {
      setToAddress(wallets[0].address);
    }
  }, [toChain, wallets, toAddressIsManual]);

  // Reset quote when params change
  useEffect(() => {
    if (step === 'quoted' || step === 'idle') {
      setQuote(null);
      setStep('idle');
    }
  }, [fromChain, toChain, amount, fromWallet, toAddress]);

  // --- Chain Swap ---
  const swapChains = useCallback(() => {
    const prevFrom = fromChain;
    const prevTo = toChain;
    setFromChain(prevTo);
    setToChain(prevFrom);
    setAmount('');
    setQuote(null);
    setStep('idle');
  }, [fromChain, toChain]);

  // --- Get Quote ---
  const handleGetQuote = useCallback(async () => {
    setError(null);

    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter an amount to bridge.');
      return;
    }
    if (!fromWallet) {
      setError('Select a source wallet.');
      return;
    }
    if (!toAddress) {
      setError('Enter or select a destination address.');
      return;
    }
    if (fromChain === toChain) {
      setError('Source and destination chains must be different.');
      return;
    }

    const fromDecimals = getNativeDecimals(fromChain);
    const rawAmount = toSmallestUnit(amount, fromDecimals);
    if (rawAmount === '0') {
      setError('Amount is too small.');
      return;
    }

    setStep('quoting');
    setQuote(null);

    try {
      const request: BridgeQuoteRequest = {
        fromChain,
        toChain,
        fromAmount: rawAmount,
        fromAddress: fromWallet,
        toAddress,
      };

      const q = await lifiClientRef.current.getQuote(request);
      setQuote(q);
      setStep('quoted');
    } catch (err) {
      console.error('Quote failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Quote failed: ${msg}`);
      setStep('idle');
    }
  }, [amount, fromWallet, toAddress, fromChain, toChain]);

  // --- Execute Bridge ---
  const handleBridge = useCallback(async () => {
    if (!quote) return;

    setError(null);
    setStep('signing');
    setStatusText('Preparing transaction...');

    // Get keypair for the source wallet
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      setError('Vault is locked. Unlock your wallet first.');
      setStep('quoted');
      return;
    }

    const fromKp = allKeypairs.find(kp => kp.publicKey.toBase58() === fromWallet);
    if (!fromKp) {
      setError('Selected source wallet keypair not found in vault.');
      setStep('quoted');
      return;
    }

    try {
      setStatusText('Signing and sending transaction...');

      // Get RPC URL for the source chain
      const fromFamily = getChainFamily(fromChain);
      let chainRpcUrl = rpcUrl; // Solana default
      if (fromFamily === 'evm') {
        chainRpcUrl = localStorage.getItem(`trench_rpc_${fromChain}`) || CHAINS[fromChain].defaultRpcUrl;
      } else if (fromFamily === 'sui') {
        chainRpcUrl = localStorage.getItem('trench_rpc_sui') || CHAINS[fromChain].defaultRpcUrl;
      }

      // For EVM chains, derive hex private key from keypair bytes
      let privateKeyHex: string | undefined;
      if (fromFamily === 'evm') {
        const kpBytes = fromKp.secretKey;
        privateKeyHex = `0x${Array.from(kpBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      }

      const result = await signAndSendBridgeTx(
        fromChain,
        quote.transactionRequest,
        fromKp.secretKey,
        chainRpcUrl,
        privateKeyHex,
      );

      const hash = result.txHash;
      setTxHash(hash);
      setBridgeTool(quote.tool);

      // Save to history as pending
      const newEntry: BridgeHistoryEntry = {
        fromChain,
        toChain,
        amount,
        txHash: hash,
        tool: quote.tool,
        timestamp: Date.now(),
        status: 'pending',
      };
      const updatedHistory = [newEntry, ...history].slice(0, MAX_HISTORY);
      setHistory(updatedHistory);
      saveBridgeHistory(updatedHistory);

      toast.success('Transaction Sent', `Bridge tx sent via ${quote.toolDetails?.name || quote.tool}`);

      // Start polling
      setStep('polling');
      setStatusText('Waiting for bridge confirmation...');
      startPolling(hash, quote.tool);

    } catch (err) {
      console.error('Bridge tx failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Transaction failed: ${msg}`);
      setStep('quoted');
      toast.error('Bridge Failed', msg);
    }
  }, [quote, getKeypairs, fromWallet, fromChain, toChain, amount, rpcUrl, history, toast]);

  // --- Status Polling ---
  const startPolling = useCallback((hash: string, tool: string) => {
    let attempts = 0;

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      attempts++;

      if (attempts > MAX_POLL_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatusText('Polling timed out. The bridge may still complete -- check the explorer.');
        setStep('done');
        return;
      }

      try {
        const status = await lifiClientRef.current.getStatus(hash, tool, fromChain, toChain);

        if (status.status === BridgeStatus.DONE) {
          if (pollRef.current) clearInterval(pollRef.current);
          setReceiveTxHash(status.receiving?.txHash || null);
          setStatusText('Bridge complete!');
          setStep('done');

          // Update history entry
          setHistory(prev => {
            const updated = prev.map(e =>
              e.txHash === hash
                ? { ...e, status: 'done' as const, receiveTxHash: status.receiving?.txHash }
                : e
            );
            saveBridgeHistory(updated);
            return updated;
          });

          toast.success('Bridge Complete', `Tokens received on ${CHAINS[toChain].name}`);
        } else if (status.status === BridgeStatus.FAILED) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatusText(`Bridge failed: ${status.substatusMessage || 'Unknown reason'}`);
          setStep('failed');

          setHistory(prev => {
            const updated = prev.map(e =>
              e.txHash === hash ? { ...e, status: 'failed' as const } : e
            );
            saveBridgeHistory(updated);
            return updated;
          });

          toast.error('Bridge Failed', status.substatusMessage || 'Unknown failure');
        } else {
          // Still pending
          const sub = status.substatusMessage || status.substatus || 'Processing...';
          setStatusText(sub);
        }
      } catch {
        // Non-fatal polling error — keep trying
      }
    }, POLL_INTERVAL_MS);
  }, [fromChain, toChain, toast]);

  // --- Reset ---
  const handleReset = useCallback(() => {
    setStep('idle');
    setQuote(null);
    setTxHash(null);
    setReceiveTxHash(null);
    setBridgeTool('');
    setStatusText('');
    setAmount('');
    setError(null);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // --- Wallet options (all wallets — for now, Solana keypairs are the vault) ---
  const walletOptions = wallets.map(w => ({
    address: w.address,
    label: `${w.name} (${truncateAddress(w.address)})`,
  }));

  // --- Derived ---
  const fromNativeToken = getNativeToken(fromChain);
  const toNativeToken = getNativeToken(toChain);
  const toDecimals = getNativeDecimals(toChain);
  const presets = AMOUNT_PRESETS[fromChain];
  const isBusy = step === 'quoting' || step === 'signing' || step === 'polling';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ArrowRightLeft className="w-6 h-6 text-blue-400" />
          Bridge
        </h1>
        <div className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400">
          Li.Fi
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===== Result Card ===== */}
      {(step === 'done' || step === 'failed') && txHash && (
        <div className={`${
          step === 'done'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
        } border rounded-lg p-5`}>
          <div className="flex items-center gap-2 mb-3">
            {step === 'done' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <h3 className={`text-lg font-semibold ${step === 'done' ? 'text-emerald-400' : 'text-red-400'}`}>
              {step === 'done' ? 'Bridge Complete!' : 'Bridge Failed'}
            </h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400">Source TX:</span>
              <a
                href={getExplorerUrl(fromChain, 'tx', txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <code className="font-mono">{truncateAddress(txHash, 8)}</code>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            {receiveTxHash && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-400">Dest TX:</span>
                <a
                  href={getExplorerUrl(toChain, 'tx', receiveTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <code className="font-mono">{truncateAddress(receiveTxHash, 8)}</code>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            {bridgeTool && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Bridge:</span>
                <span className="text-sm text-white capitalize">{bridgeTool}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleReset}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            New Bridge
          </button>
        </div>
      )}

      {/* ===== Progress Display ===== */}
      {(step === 'signing' || step === 'polling') && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-5">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <h3 className="text-lg font-semibold text-blue-400">
              {step === 'signing' ? 'Sending Transaction...' : 'Bridging...'}
            </h3>
          </div>
          <p className="text-sm text-gray-400">{statusText}</p>
          {txHash && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">TX:</span>
              <a
                href={getExplorerUrl(fromChain, 'tx', txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <code className="font-mono">{truncateAddress(txHash, 6)}</code>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* ===== Main Bridge Form ===== */}
      {step !== 'done' && step !== 'failed' && step !== 'signing' && step !== 'polling' && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          {/* Section 1: Chain Selection Row */}
          <div className="flex items-center gap-3 mb-6">
            {/* From Chain */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-2">From</label>
              <select
                value={fromChain}
                onChange={(e) => {
                  const newFrom = e.target.value as ChainId;
                  if (newFrom === toChain) {
                    setToChain(fromChain);
                  }
                  setFromChain(newFrom);
                  setAmount('');
                }}
                disabled={isBusy}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 appearance-none"
              >
                {ACTIVE_CHAIN_IDS.map(c => (
                  <option key={c} value={c}>
                    {CHAINS[c].name} ({CHAINS[c].nativeToken})
                  </option>
                ))}
              </select>
            </div>

            {/* Swap Button */}
            <div className="flex items-end pb-0.5">
              <button
                onClick={swapChains}
                disabled={isBusy}
                className="p-2.5 mt-6 rounded-lg bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Swap chains"
              >
                <ArrowDownUp className="w-4 h-4" />
              </button>
            </div>

            {/* To Chain */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-2">To</label>
              <select
                value={toChain}
                onChange={(e) => {
                  const newTo = e.target.value as ChainId;
                  if (newTo === fromChain) {
                    setFromChain(toChain);
                  }
                  setToChain(newTo);
                }}
                disabled={isBusy}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 appearance-none"
              >
                {ACTIVE_CHAIN_IDS.map(c => (
                  <option key={c} value={c}>
                    {CHAINS[c].name} ({CHAINS[c].nativeToken})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chain color indicators */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: CHAINS[fromChain].color }}
              />
              <span className="text-xs text-gray-400">{CHAINS[fromChain].name}</span>
            </div>
            <div className="w-10" />
            <div className="flex-1 flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: CHAINS[toChain].color }}
              />
              <span className="text-xs text-gray-400">{CHAINS[toChain].name}</span>
            </div>
          </div>

          {/* Section 2: Amount Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount ({fromNativeToken})
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`0.0 ${fromNativeToken}`}
              disabled={isBusy}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <div className="flex items-center gap-2 mt-2">
              {presets.map(p => (
                <button
                  key={p}
                  onClick={() => setAmount(p.toString())}
                  disabled={isBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Wallet Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* From Wallet */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">From Wallet</label>
              <select
                value={fromWallet}
                onChange={(e) => setFromWallet(e.target.value)}
                disabled={isBusy}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 appearance-none"
              >
                <option value="">Select a wallet...</option>
                {walletOptions.map(w => (
                  <option key={w.address} value={w.address}>{w.label}</option>
                ))}
              </select>
              {isLocked && wallets.length === 0 && (
                <p className="text-xs text-yellow-400 mt-1">Unlock your vault to see wallets.</p>
              )}
            </div>

            {/* To Address */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                To Address
                <button
                  onClick={() => {
                    setToAddressIsManual(!toAddressIsManual);
                    if (!toAddressIsManual) {
                      setToAddress('');
                    } else if (wallets.length > 0) {
                      setToAddress(wallets[0].address);
                    }
                  }}
                  className="ml-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {toAddressIsManual ? 'Use vault wallet' : 'Enter manually'}
                </button>
              </label>
              {toAddressIsManual ? (
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder={`Paste ${CHAINS[toChain].name} address...`}
                  disabled={isBusy}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-mono"
                />
              ) : (
                <select
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  disabled={isBusy}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-blue-500 disabled:opacity-50 appearance-none"
                >
                  <option value="">Select a wallet...</option>
                  {walletOptions.map(w => (
                    <option key={w.address} value={w.address}>{w.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Get Quote Button */}
          {step === 'idle' && (
            <button
              onClick={handleGetQuote}
              disabled={!amount || parseFloat(amount) <= 0 || !fromWallet || !toAddress || fromChain === toChain}
              className="w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 hover:border-blue-500/50 text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-5 h-5" />
              Get Quote
            </button>
          )}

          {/* Quoting spinner */}
          {step === 'quoting' && (
            <div className="w-full py-3 rounded-lg flex items-center justify-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              Fetching best route...
            </div>
          )}

          {/* Section 4: Quote Card */}
          {step === 'quoted' && quote && (
            <div className="mt-4 space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Quote</h3>
                  <span className="ml-auto text-xs text-gray-500 capitalize">
                    via {quote.toolDetails?.name || quote.tool}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Output */}
                  <div>
                    <p className="text-gray-500 text-xs mb-1">You receive</p>
                    <p className="text-white font-semibold">
                      {formatAmount(quote.estimate.toAmount, toDecimals)} {toNativeToken}
                    </p>
                    <p className="text-gray-500 text-xs">
                      min: {formatAmount(quote.estimate.toAmountMin, toDecimals)} {toNativeToken}
                    </p>
                  </div>

                  {/* Duration */}
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Estimated time</p>
                    <p className="text-white font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {formatDuration(quote.estimate.executionDurationSeconds)}
                    </p>
                  </div>

                  {/* Fees */}
                  {quote.estimate.feeCosts.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Bridge fees</p>
                      {quote.estimate.feeCosts.map((fee, i) => (
                        <p key={i} className="text-gray-300 text-xs">
                          {fee.name}: {formatUSD(fee.amountUSD)}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Gas */}
                  {quote.estimate.gasCosts.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Gas costs</p>
                      {quote.estimate.gasCosts.map((gas, i) => (
                        <p key={i} className="text-gray-300 text-xs">
                          {gas.name}: {formatUSD(gas.amountUSD)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bridge Button */}
              <button
                onClick={handleBridge}
                className="w-full py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              >
                <ArrowRightLeft className="w-5 h-5" />
                Bridge {amount} {fromNativeToken} to {CHAINS[toChain].name}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== Bridge History ===== */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Bridge History</h2>
          {history.length > 0 && (
            <span className="text-xs text-gray-500 ml-auto">{history.length} bridge{history.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ArrowRightLeft className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No bridges yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Route</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium">Amount</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Bridge</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Status</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Date</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium">TX</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, idx) => (
                  <tr key={`${entry.txHash}-${idx}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CHAINS[entry.fromChain].color }}
                        />
                        <span className="text-white text-xs">{CHAINS[entry.fromChain].nativeToken}</span>
                        <ArrowRightLeft className="w-3 h-3 text-gray-500" />
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CHAINS[entry.toChain].color }}
                        />
                        <span className="text-white text-xs">{CHAINS[entry.toChain].nativeToken}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-gray-300 font-mono text-xs">
                        {entry.amount} {CHAINS[entry.fromChain].nativeToken}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-gray-400 text-xs capitalize">{entry.tool}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-medium ${
                        entry.status === 'done' ? 'text-emerald-400' :
                        entry.status === 'failed' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {entry.status === 'done' ? 'Complete' :
                         entry.status === 'failed' ? 'Failed' :
                         'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-gray-400 text-xs">
                        {new Date(entry.timestamp).toLocaleDateString()}{' '}
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={getExplorerUrl(entry.fromChain, 'tx', entry.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title={`View on ${CHAINS[entry.fromChain].name} explorer`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {entry.receiveTxHash && (
                          <a
                            href={getExplorerUrl(entry.toChain, 'tx', entry.receiveTxHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                            title={`View on ${CHAINS[entry.toChain].name} explorer`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
