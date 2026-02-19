import { useState, useCallback } from 'react';
import { X, ArrowUp, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  walletBalance: number;
}

export function WithdrawModal({ isOpen, onClose, walletAddress, walletBalance }: WithdrawModalProps) {
  const { getKeypairs, isLocked, unlock } = useSecureWallet();
  const { rpcUrl, network } = useNetwork();

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const RENT_RESERVE = 0.001; // Keep some SOL for rent

  const maxAmount = Math.max(0, walletBalance - RENT_RESERVE);

  const handleWithdraw = useCallback(async () => {
    setError(null);
    setTxHash(null);

    if (!toAddress.trim()) {
      setError('Enter a destination address');
      return;
    }

    const amountSol = parseFloat(amount);
    if (!amountSol || amountSol <= 0) {
      setError('Enter a valid amount');
      return;
    }

    if (amountSol > maxAmount) {
      setError(`Max withdrawable: ${maxAmount.toFixed(4)} SOL`);
      return;
    }

    setIsLoading(true);

    try {
      // Unlock vault if needed
      if (isLocked) {
        if (!password) {
          setError('Enter your vault password to sign the transaction');
          setIsLoading(false);
          return;
        }
        await unlock(password);
      }

      // Get keypair for active wallet
      const keypairs = getKeypairs();
      const walletKeypair = keypairs.find(
        kp => kp.publicKey.toBase58() === walletAddress
      );

      if (!walletKeypair) {
        throw new Error('Keypair not found. Try unlocking your vault again.');
      }

      // Dynamic import to keep bundle lighter
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } =
        await import('@solana/web3.js');

      const connection = new Connection(rpcUrl, 'confirmed');

      // Validate destination address
      let destPubkey: InstanceType<typeof PublicKey>;
      try {
        destPubkey = new PublicKey(toAddress.trim());
      } catch {
        throw new Error('Invalid destination address');
      }

      // Create transfer
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: walletKeypair.publicKey,
          toPubkey: destPubkey,
          lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletKeypair.publicKey;
      transaction.sign(walletKeypair);

      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      await connection.confirmTransaction(signature, 'confirmed');

      setTxHash(signature);

      // Refresh wallet balance
      window.dispatchEvent(new Event('wallet-updated'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [toAddress, amount, password, isLocked, unlock, getKeypairs, walletAddress, rpcUrl, maxAmount]);

  const handleClose = () => {
    setToAddress('');
    setAmount('');
    setPassword('');
    setError(null);
    setTxHash(null);
    setIsLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  const solscanUrl = txHash
    ? `https://solscan.io/tx/${txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`
    : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={handleClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={handleClose}>
        <div
          className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <ArrowUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Withdraw SOL</h3>
                <p className="text-xs text-slate-400">
                  From {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="text-slate-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Success state */}
          {txHash ? (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <ArrowUp className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Transaction Sent</p>
                <p className="text-sm text-slate-400 mt-1">
                  {amount} SOL sent successfully
                </p>
              </div>
              <a
                href={solscanUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
              >
                View on Solscan <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={handleClose}
                className="w-full mt-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Balance */}
              <div className="bg-slate-800/50 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Available</span>
                <span className="text-sm font-medium text-white">{walletBalance.toFixed(4)} SOL</span>
              </div>

              {/* Destination address */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Destination Address</label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={e => setToAddress(e.target.value)}
                  placeholder="Enter Solana address..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Amount (SOL)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.001"
                    min="0"
                    max={maxAmount}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-16"
                  />
                  <button
                    onClick={() => setAmount(maxAmount.toFixed(6))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Vault password (if locked) */}
              {isLocked && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Vault Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter vault password to sign..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleWithdraw}
                disabled={isLoading || !toAddress || !amount}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <ArrowUp className="w-4 h-4" />
                    Send {amount ? `${amount} SOL` : 'SOL'}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
