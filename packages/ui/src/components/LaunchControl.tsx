/**
 * LaunchControl - PumpFun Token Launcher & Creator Fee Claiming
 * TrenchSniper OS
 *
 * Three sections:
 * 1. Token Launch Form (create PumpFun token via PumpPortal)
 * 2. Claim Creator Fees
 * 3. Launch History
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  Rocket,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  ImagePlus,
  Clock,
  Coins,
  X,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { useToast } from './Toast';

// ============ Types ============

interface LaunchHistoryEntry {
  mintAddress: string;
  name: string;
  symbol: string;
  creatorWallet: string;
  txHash: string;
  initialBuySol: number;
  timestamp: number;
}

// ============ Constants ============

const LAUNCH_HISTORY_KEY = 'trench_launch_history';
const MAX_HISTORY = 100;
const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ============ Helpers ============

function loadLaunchHistory(): LaunchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LAUNCH_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LaunchHistoryEntry[];
  } catch {
    return [];
  }
}

function saveLaunchHistory(entries: LaunchHistoryEntry[]) {
  const capped = entries.slice(0, MAX_HISTORY);
  localStorage.setItem(LAUNCH_HISTORY_KEY, JSON.stringify(capped));
}

function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

// ============ Component ============

export function LaunchControl() {
  const { rpcUrl } = useNetwork();
  const { wallets, getKeypairs, isLocked } = useSecureWallet({ rpcUrl });
  const toast = useToast();

  // --- Token Launch Form State ---
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [website, setWebsite] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [initialBuySol, setInitialBuySol] = useState('0');
  const [slippagePct, setSlippagePct] = useState('50');
  const [priorityFee, setPriorityFee] = useState('0.001');
  const [selectedWallet, setSelectedWallet] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ mintAddress: string; txHash: string } | null>(null);

  // --- Claim State ---
  const [claimWallet, setClaimWallet] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  // --- History ---
  const [history, setHistory] = useState<LaunchHistoryEntry[]>([]);

  // --- Error ---
  const [error, setError] = useState<string | null>(null);

  // --- Drag state ---
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    setHistory(loadLaunchHistory());
  }, []);

  // Auto-select first wallet
  useEffect(() => {
    if (wallets.length > 0 && !selectedWallet) {
      setSelectedWallet(wallets[0].address);
    }
    if (wallets.length > 0 && !claimWallet) {
      setClaimWallet(wallets[0].address);
    }
  }, [wallets, selectedWallet, claimWallet]);

  // --- Image Handling ---

  const handleImageSelect = useCallback((file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Invalid image type. Use PNG, JPG, GIF, or WebP.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image too large. Maximum size is 10MB.');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  }, [handleImageSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  }, [handleImageSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearImage = useCallback(() => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [imagePreview]);

  // --- Launch Token ---

  const handleLaunch = useCallback(async () => {
    // Validate inputs
    if (!name.trim()) { setError('Token name is required.'); return; }
    if (!symbol.trim()) { setError('Token symbol is required.'); return; }
    if (!description.trim()) { setError('Token description is required.'); return; }
    if (!imageFile) { setError('Token image is required.'); return; }
    if (!selectedWallet) { setError('Select a wallet to launch from.'); return; }

    // Get keypair
    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      setError('Vault is locked. Unlock your wallet first.');
      return;
    }

    const creatorKp = allKeypairs.find(kp => kp.publicKey.toBase58() === selectedWallet);
    if (!creatorKp) {
      setError('Selected wallet keypair not found. Make sure vault is unlocked.');
      return;
    }

    setIsLaunching(true);
    setError(null);
    setLaunchResult(null);

    try {
      // 1. Read image file
      const imageBuffer = await imageFile.arrayBuffer();

      // 2. Build FormData for IPFS upload
      const formData = new FormData();
      formData.append('file', new Blob([imageBuffer], { type: imageFile.type }), imageFile.name);
      formData.append('name', name.trim());
      formData.append('symbol', symbol.trim());
      formData.append('description', description.trim());
      if (twitter.trim()) formData.append('twitter', twitter.trim());
      if (telegram.trim()) formData.append('telegram', telegram.trim());
      if (website.trim()) formData.append('website', website.trim());
      formData.append('showName', 'true');

      // 3. Upload to IPFS
      const ipfsUrl = IS_HOSTED
        ? `${window.location.origin}/api/ipfs`
        : 'https://pump.fun/api/ipfs';

      const ipfsRes = await fetch(ipfsUrl, {
        method: 'POST',
        body: formData,
      });

      if (!ipfsRes.ok) {
        const errText = await ipfsRes.text().catch(() => 'Unknown error');
        throw new Error(`IPFS upload failed (${ipfsRes.status}): ${errText}`);
      }

      const ipfsData = await ipfsRes.json();
      const metadataUri = ipfsData.metadataUri || ipfsData.metadata?.uri;
      if (!metadataUri) {
        throw new Error('IPFS upload succeeded but no metadata URI returned.');
      }

      // 4. Generate mint keypair
      const mintKeypair = Keypair.generate();

      // 5. Build create transaction via PumpPortal
      const createPayload = {
        publicKey: selectedWallet,
        action: 'create',
        tokenMetadata: {
          name: name.trim(),
          symbol: symbol.trim(),
          uri: metadataUri,
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'true',
        amount: parseFloat(initialBuySol) || 0,
        slippage: parseFloat(slippagePct) || 50,
        priorityFee: parseFloat(priorityFee) || 0.001,
        pool: 'pump',
      };

      const portalRes = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!portalRes.ok) {
        const errText = await portalRes.text().catch(() => 'Unknown error');
        throw new Error(`PumpPortal create failed (${portalRes.status}): ${errText}`);
      }

      // 6. Deserialize + sign transaction
      const txData = await portalRes.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([creatorKp, mintKeypair]);

      // 7. Send + confirm
      const connection = new Connection(rpcUrl, 'confirmed');
      const txHash = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Poll getSignatureStatuses (12 x 2.5s = 30s)
      let confirmed = false;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statuses = await connection.getSignatureStatuses([txHash]);
        const status = statuses.value?.[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      }

      if (!confirmed) {
        // Tx may still land; treat as tentative success
        toast.warning('Launch sent', 'Transaction sent but confirmation timed out. Check Solscan.');
      }

      // 8. Platform fee (hosted mode)
      if (IS_HOSTED && (parseFloat(initialBuySol) || 0) > 0) {
        try {
          const feeAccount = localStorage.getItem('trench_fee_account');
          const feeBpsStr = localStorage.getItem('trench_fee_bps');
          if (feeAccount && feeBpsStr) {
            const feeBps = parseInt(feeBpsStr, 10);
            const buyLamports = Math.floor((parseFloat(initialBuySol) || 0) * LAMPORTS_PER_SOL);
            const feeLamports = Math.floor(buyLamports * feeBps / 10000);
            if (feeLamports > 0) {
              const feeTx = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: creatorKp.publicKey,
                  toPubkey: new PublicKey(feeAccount),
                  lamports: feeLamports,
                })
              );
              feeTx.feePayer = creatorKp.publicKey;
              feeTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
              feeTx.sign(creatorKp);
              await connection.sendRawTransaction(feeTx.serialize(), { skipPreflight: true });
            }
          }
        } catch (feeErr) {
          console.error('Platform fee transfer failed (non-critical):', feeErr);
        }
      }

      // 9. Save to history
      const mintAddress = mintKeypair.publicKey.toBase58();
      const newEntry: LaunchHistoryEntry = {
        mintAddress,
        name: name.trim(),
        symbol: symbol.trim(),
        creatorWallet: selectedWallet,
        txHash,
        initialBuySol: parseFloat(initialBuySol) || 0,
        timestamp: Date.now(),
      };
      const updatedHistory = [newEntry, ...history].slice(0, MAX_HISTORY);
      setHistory(updatedHistory);
      saveLaunchHistory(updatedHistory);

      // 10. Success
      setLaunchResult({ mintAddress, txHash });
      toast.success('Token Launched!', `${name} (${symbol}) created successfully.`);

    } catch (err) {
      console.error('Launch failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Launch failed: ${msg}`);
      toast.error('Launch Failed', msg);
    } finally {
      setIsLaunching(false);
    }
  }, [
    name, symbol, description, imageFile, selectedWallet, initialBuySol,
    slippagePct, priorityFee, twitter, telegram, website,
    getKeypairs, rpcUrl, history, toast,
  ]);

  // --- Claim Creator Fees ---

  const handleClaimFees = useCallback(async () => {
    if (!claimWallet) { setError('Select a wallet to claim fees.'); return; }

    const allKeypairs = getKeypairs();
    if (allKeypairs.length === 0) {
      setError('Vault is locked. Unlock your wallet first.');
      return;
    }

    const signerKp = allKeypairs.find(kp => kp.publicKey.toBase58() === claimWallet);
    if (!signerKp) {
      setError('Selected wallet keypair not found.');
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      // POST to PumpPortal
      const res = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: claimWallet,
          action: 'collectCreatorFee',
          priorityFee: 0.000001,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Claim request failed (${res.status}): ${errText}`);
      }

      // Deserialize + sign
      const txData = await res.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([signerKp]);

      // Send + confirm
      const connection = new Connection(rpcUrl, 'confirmed');
      const txHash = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });

      // Poll confirmation (12 x 2.5s = 30s)
      let confirmed = false;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statuses = await connection.getSignatureStatuses([txHash]);
        const status = statuses.value?.[0];
        if (status) {
          if (status.err) {
            throw new Error(`Claim transaction failed: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      }

      if (confirmed) {
        toast.success('Fees Claimed', 'Creator fees collected successfully.');
      } else {
        toast.warning('Claim Sent', 'Transaction sent but confirmation timed out.');
      }

    } catch (err) {
      console.error('Claim failed:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Claim failed: ${msg}`);
      toast.error('Claim Failed', msg);
    } finally {
      setIsClaiming(false);
    }
  }, [claimWallet, getKeypairs, rpcUrl, toast]);

  // --- Copy helper ---
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  // --- Wallet selector options ---
  const walletOptions = wallets.map(w => ({
    address: w.address,
    label: `${w.name} (${truncateAddress(w.address)})`,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Rocket className="w-6 h-6 text-emerald-500" />
          Launch Control
        </h1>
        <div className="px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400">
          PumpFun
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

      {/* Success Result */}
      {launchResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-emerald-400">Token Launched Successfully!</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Mint:</span>
              <code className="text-sm text-white font-mono">{truncateAddress(launchResult.mintAddress, 8)}</code>
              <button
                onClick={() => copyToClipboard(launchResult.mintAddress, 'mint')}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {copiedField === 'mint' && <span className="text-xs text-emerald-400">Copied!</span>}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <a
                href={`https://pump.fun/${launchResult.mintAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                pump.fun
              </a>
              <a
                href={`https://solscan.io/tx/${launchResult.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Solscan
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ===== Section 1: Token Launch Form ===== */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-6">
          <Rocket className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-white">Create Token</h2>
        </div>

        {/* Wallet Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Creator Wallet</label>
          <select
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
            disabled={isLaunching}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 appearance-none"
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

        {/* Name + Symbol */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Token Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Token"
              disabled={isLaunching}
              maxLength={32}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Symbol *</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. MTK"
              disabled={isLaunching}
              maxLength={10}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your token..."
            disabled={isLaunching}
            rows={3}
            maxLength={500}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">{description.length}/500</p>
        </div>

        {/* Image Upload */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Token Image *</label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isLaunching && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragging
                ? 'border-emerald-500 bg-emerald-500/10'
                : imagePreview
                  ? 'border-gray-600 bg-gray-900'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-900'
              }
              ${isLaunching ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={isLaunching}
            />
            {imagePreview ? (
              <div className="flex items-center gap-4">
                <img
                  src={imagePreview}
                  alt="Token preview"
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <div className="flex-1 text-left">
                  <p className="text-sm text-white">{imageFile?.name}</p>
                  <p className="text-xs text-gray-500">
                    {imageFile ? (imageFile.size / 1024).toFixed(1) : '0'} KB
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); clearImage(); }}
                  className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <ImagePlus className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  Drop image here or <span className="text-emerald-400">click to upload</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF, WebP (max 10MB)</p>
              </div>
            )}
          </div>
        </div>

        {/* Social Links */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Twitter</label>
            <input
              type="text"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="@handle or URL"
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Telegram</label>
            <input
              type="text"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="t.me/group"
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Website</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Trading Parameters */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Initial Buy (SOL)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={initialBuySol}
              onChange={(e) => setInitialBuySol(e.target.value)}
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">0 = no initial buy</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Slippage (%)</label>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={slippagePct}
              onChange={(e) => setSlippagePct(e.target.value)}
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Priority Fee (SOL)</label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              value={priorityFee}
              onChange={(e) => setPriorityFee(e.target.value)}
              disabled={isLaunching}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Launch Button */}
        <button
          onClick={handleLaunch}
          disabled={isLaunching || !name.trim() || !symbol.trim() || !description.trim() || !imageFile || !selectedWallet}
          className="w-full py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLaunching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Launching Token...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              Launch Token
            </>
          )}
        </button>
      </div>

      {/* ===== Section 2: Claim Creator Fees ===== */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Coins className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-white">Claim Creator Fees</h2>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          PumpFun gives token creators 0.05%-0.95% of all trades. This claims all accumulated fees at once.
        </p>

        {/* Wallet Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Wallet</label>
          <select
            value={claimWallet}
            onChange={(e) => setClaimWallet(e.target.value)}
            disabled={isClaiming}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:ring-2 focus:ring-amber-500 disabled:opacity-50 appearance-none"
          >
            <option value="">Select a wallet...</option>
            {walletOptions.map(w => (
              <option key={w.address} value={w.address}>{w.label}</option>
            ))}
          </select>
        </div>

        {/* Claim Button */}
        <button
          onClick={handleClaimFees}
          disabled={isClaiming || !claimWallet}
          className="w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isClaiming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Claiming Fees...
            </>
          ) : (
            <>
              <Coins className="w-5 h-5" />
              Claim All Creator Fees
            </>
          )}
        </button>
      </div>

      {/* ===== Section 3: Launch History ===== */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Launch History</h2>
          {history.length > 0 && (
            <span className="text-xs text-gray-500 ml-auto">{history.length} token{history.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Rocket className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No tokens launched yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Token</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Mint</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium">Initial Buy</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">Date</th>
                  <th className="text-right py-2 px-3 text-gray-400 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, idx) => (
                  <tr key={`${entry.mintAddress}-${idx}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-3">
                      <div>
                        <p className="text-white font-medium">{entry.name}</p>
                        <p className="text-xs text-gray-500">{entry.symbol}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-gray-300 font-mono">
                          {truncateAddress(entry.mintAddress, 6)}
                        </code>
                        <button
                          onClick={() => copyToClipboard(entry.mintAddress, `hist-${idx}`)}
                          className="text-gray-500 hover:text-white transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        {copiedField === `hist-${idx}` && (
                          <span className="text-xs text-emerald-400">Copied</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-gray-300 font-mono">
                        {entry.initialBuySol > 0 ? `${entry.initialBuySol} SOL` : '--'}
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
                          href={`https://pump.fun/${entry.mintAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 transition-colors"
                          title="View on pump.fun"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`https://solscan.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="View on Solscan"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
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
