/**
 * QuickSwap - Simple token swap interface
 * For manual trades via Jupiter
 */

import { useState, useCallback } from 'react';
import {
  ArrowDownUp,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { Connection, VersionedTransaction } from '@solana/web3.js';

const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';
const WSOL = 'So11111111111111111111111111111111111111112';

interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  outputAmount?: string;
}

export function QuickSwap() {
  const { rpcUrl, network } = useNetwork();
  const { wallets, isLocked, getKeypairs } = useSecureWallet({ rpcUrl });

  const [tokenMint, setTokenMint] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [isBuy, setIsBuy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [selectedWalletIndex, setSelectedWalletIndex] = useState(0);

  const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';

  const executeSwap = useCallback(async () => {
    if (!tokenMint || !amount || !jupiterApiKey) {
      setResult({ success: false, error: 'Missing token, amount, or API key' });
      return;
    }

    if (isLocked) {
      setResult({ success: false, error: 'Unlock your wallet first' });
      return;
    }

    const keypairs = getKeypairs();
    if (keypairs.length === 0) {
      setResult({ success: false, error: 'No wallets available' });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const wallet = keypairs[selectedWalletIndex] || keypairs[0];
      const connection = new Connection(rpcUrl, 'confirmed');

      const inputMint = isBuy ? WSOL : tokenMint;
      const outputMint = isBuy ? tokenMint : WSOL;
      const amountLamports = Math.floor(parseFloat(amount) * 1e9);

      // Get quote
      const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
        inputMint,
        outputMint,
        amount: String(amountLamports),
        slippageBps: '100'
      });

      const quoteResp = await fetch(quoteUrl, {
        headers: { 'x-api-key': jupiterApiKey }
      });

      if (!quoteResp.ok) {
        throw new Error(`Quote failed: ${quoteResp.status}`);
      }

      const quote = await quoteResp.json();
      const outputAmount = (Number(quote.outAmount) / 1e6).toFixed(4);

      // Get swap transaction
      const swapResp = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': jupiterApiKey
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        })
      });

      if (!swapResp.ok) {
        throw new Error(`Swap failed: ${swapResp.status}`);
      }

      const swapResult = await swapResp.json();

      // Sign and send
      const swapTxBuf = Buffer.from(swapResult.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(swapTxBuf);
      tx.sign([wallet]);

      const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3
      });

      setResult({
        success: true,
        txHash: signature,
        outputAmount
      });

    } catch (err) {
      setResult({
        success: false,
        error: (err as Error).message
      });
    } finally {
      setIsLoading(false);
    }
  }, [tokenMint, amount, isBuy, jupiterApiKey, isLocked, getKeypairs, selectedWalletIndex, rpcUrl]);

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <ArrowDownUp className="w-5 h-5 text-purple-400" />
        Quick Swap
      </h3>

      <div className="space-y-4">
        {/* Wallet Selector */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Wallet</label>
          {isLocked ? (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              🔒 Unlock wallet to swap
            </div>
          ) : (
            <select
              value={selectedWalletIndex}
              onChange={(e) => setSelectedWalletIndex(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            >
              {wallets.map((w, i) => (
                <option key={w.id || i} value={i}>
                  {w.name} ({(w.balance || 0).toFixed(4)} SOL)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Token Input */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Token Mint</label>
          <input
            type="text"
            value={tokenMint}
            onChange={(e) => setTokenMint(e.target.value)}
            placeholder="Enter token mint address..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">
            Amount ({isBuy ? 'SOL' : 'Tokens'})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          />
        </div>

        {/* Buy/Sell Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setIsBuy(true)}
            className={`py-2 rounded-lg font-medium transition-colors ${
              isBuy
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setIsBuy(false)}
            className={`py-2 rounded-lg font-medium transition-colors ${
              !isBuy
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Sell
          </button>
        </div>

        {/* Swap Button */}
        <button
          onClick={executeSwap}
          disabled={isLoading || isLocked || !tokenMint || !amount}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Swapping...
            </>
          ) : (
            <>
              <ArrowDownUp className="w-4 h-4" />
              {isBuy ? 'Buy Token' : 'Sell Token'}
            </>
          )}
        </button>

        {/* Result */}
        {result && (
          <div className={`p-3 rounded-lg ${
            result.success ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {result.success ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <div className="flex-1">
                  <p className="text-sm text-emerald-400 font-medium">Swap successful!</p>
                  {result.outputAmount && (
                    <p className="text-xs text-slate-400">Received: {result.outputAmount}</p>
                  )}
                </div>
                {result.txHash && (
                  <a
                    href={`https://solscan.io/tx/${result.txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline text-xs flex items-center gap-1"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-sm text-red-400">{result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* API Key Warning */}
        {!jupiterApiKey && (
          <p className="text-xs text-yellow-400">
            ⚠️ No Jupiter API key found. Set it in Settings.
          </p>
        )}
      </div>
    </div>
  );
}

export default QuickSwap;
