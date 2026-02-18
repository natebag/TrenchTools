/**
 * WalletManager - Real HD Wallet Generation & Management
 * TrenchSniper OS
 * 
 * Wired to real:
 * - generate() from @trenchtools/core for HD wallet derivation
 * - generateMnemonic() for new seed phrases
 * - WalletContext for state persistence
 * - Real encryption status from vault
 */

import { useState, useCallback } from 'react';
import {
  Wallet,
  Key,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Copy,
  AlertCircle,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import {
  generate,
  generateMnemonic,
  validateMnemonic,
  keypairsToWalletData,
} from '@trenchtools/core';
import { useWallet } from '@/context/WalletContext';

export function WalletManager() {
  const {
    wallets,
    addWallet,
    removeWallet,
    exportState,
    importState,
    loading: contextLoading,
    addActivity,
  } = useWallet();

  // UI State
  const [showKeys, setShowKeys] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Generation form state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [walletCount, setWalletCount] = useState(3);
  const [derivationType, setDerivationType] = useState<'random' | 'hd'>('hd');
  const [customMnemonic, setCustomMnemonic] = useState('');
  const [useExistingMnemonic, setUseExistingMnemonic] = useState(false);
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);

  // Import/Export state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');

  // Copy to clipboard helper
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`${label} copied to clipboard!`);
    setTimeout(() => setSuccess(null), 2000);
  }, []);

  // Generate real wallets using @trenchtools/core
  const handleGenerateWallets = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setGeneratedMnemonic(null);

    try {
      let mnemonic: string | undefined;
      
      if (derivationType === 'hd') {
        if (useExistingMnemonic) {
          if (!validateMnemonic(customMnemonic)) {
            throw new Error('Invalid mnemonic phrase. Must be 12 or 24 words.');
          }
          mnemonic = customMnemonic.trim();
        } else {
          // Generate new mnemonic
          mnemonic = generateMnemonic(128); // 12 words
          setGeneratedMnemonic(mnemonic);
        }
      }

      // Generate real keypairs
      const keypairs = generate({
        count: walletCount,
        derivation: derivationType,
        hdSeed: mnemonic,
        startIndex: wallets.filter(w => w.type === 'sniper').length, // Continue from existing
      });

      // Convert to wallet data
      const walletDatas = keypairsToWalletData(
        keypairs,
        derivationType === 'hd' ? wallets.filter(w => w.type === 'sniper').length : undefined
      );

      // Add first one as treasury if none exists
      const hasTreasury = wallets.some(w => w.type === 'treasury');
      
      walletDatas.forEach((walletData: { publicKey: string; secretKey: Uint8Array; derivationPath?: string }, idx: number) => {
        addWallet({
          address: walletData.publicKey,
          name: !hasTreasury && idx === 0 
            ? 'Treasury' 
            : `Sniper ${wallets.filter(w => w.type === 'sniper').length + idx + (hasTreasury ? 1 : 0)}`,
          balance: 0,
          encrypted: true,
          type: !hasTreasury && idx === 0 ? 'treasury' : 'sniper',
          privateKey: Buffer.from(walletData.secretKey).toString('hex'),
          derivationPath: walletData.derivationPath,
        });
      });

      addActivity({
        type: 'fund',
        description: `Generated ${walletCount} ${derivationType === 'hd' ? 'HD' : 'random'} wallets`,
      });

      setSuccess(`Successfully generated ${walletCount} wallets!`);
      
      // Keep modal open if we just generated a new mnemonic (user needs to save it)
      // Otherwise close it
      if (derivationType !== 'hd' || useExistingMnemonic) {
        setShowGenerateModal(false);
      }
    } catch (err) {
      console.error('Wallet generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate wallets');
      addActivity({
        type: 'error',
        description: `Wallet generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } finally {
      setGenerating(false);
    }
  }, [
    derivationType,
    walletCount,
    useExistingMnemonic,
    customMnemonic,
    wallets,
    addWallet,
    addActivity,
    generatedMnemonic,
  ]);

  // Export wallets (without private keys for security)
  const handleExport = useCallback(() => {
    const data = exportState();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trenchsniper-wallets-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    addActivity({
      type: 'fund',
      description: 'Exported wallet configuration',
    });
    setSuccess('Configuration exported!');
    setTimeout(() => setSuccess(null), 2000);
  }, [exportState, addActivity]);

  // Import wallets
  const handleImport = useCallback(() => {
    if (!importData.trim()) {
      setError('No import data provided');
      return;
    }

    try {
      const success = importState(importData);
      if (success) {
        setSuccess('Configuration imported successfully!');
        setShowImportModal(false);
        setImportData('');
      } else {
        setError('Failed to import configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid import data');
    }
  }, [importData, importState]);

  // Delete wallet with confirmation
  const handleDeleteWallet = useCallback((id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
      removeWallet(id);
      addActivity({
        type: 'fund',
        description: `Deleted wallet: ${name}`,
      });
    }
  }, [removeWallet, addActivity]);

  // Loading state
  if (contextLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <span className="ml-3 text-gray-400">Loading wallets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-500" />
          Wallet Manager
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowKeys(!showKeys)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {showKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showKeys ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          <span className="text-emerald-400">{success}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-gray-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate Wallets
        </button>
        <button
          onClick={handleExport}
          disabled={wallets.length === 0}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>
      </div>

      {/* Wallets List */}
      <div className="grid gap-4">
        {wallets.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
            <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No wallets yet.</p>
            <p className="text-sm text-gray-500">Click "Generate Wallets" to create HD-derived wallets.</p>
          </div>
        ) : (
          wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`bg-gray-800 rounded-lg p-4 border ${
                wallet.type === 'treasury' 
                  ? 'border-emerald-500/50' 
                  : 'border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    wallet.encrypted ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                  }`}>
                    {wallet.encrypted ? (
                      <Lock className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Unlock className="w-5 h-5 text-amber-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{wallet.name}</p>
                      {wallet.type === 'treasury' && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                          Treasury
                        </span>
                      )}
                      {wallet.type === 'sniper' && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                          Sniper
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500 font-mono">
                        {showKeys ? wallet.address : `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`}
                      </p>
                      <button
                        onClick={() => copyToClipboard(wallet.address, 'Address')}
                        className="text-gray-500 hover:text-emerald-400 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    {showKeys && wallet.derivationPath && (
                      <p className="text-xs text-gray-600 font-mono mt-1">
                        Path: {wallet.derivationPath}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{wallet.balance.toFixed(6)} SOL</p>
                    <p className="text-xs text-emerald-500">
                      {wallet.encrypted ? 'Encrypted' : 'Unencrypted'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteWallet(wallet.id, wallet.name)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stats Summary */}
      {wallets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Total Wallets</p>
            <p className="text-2xl font-bold text-white">{wallets.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Treasury</p>
            <p className="text-2xl font-bold text-emerald-400">
              {wallets.filter(w => w.type === 'treasury').length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Snipers</p>
            <p className="text-2xl font-bold text-blue-400">
              {wallets.filter(w => w.type === 'sniper').length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Total Balance</p>
            <p className="text-2xl font-bold text-white">
              {wallets.reduce((sum, w) => sum + w.balance, 0).toFixed(4)} SOL
            </p>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-500" />
              Generate Wallets
            </h2>

            {/* Generated Mnemonic Display */}
            {generatedMnemonic && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-amber-400 font-medium">Save Your Seed Phrase!</p>
                    <p className="text-xs text-amber-500/70">
                      This is the ONLY time you'll see this. Write it down securely.
                    </p>
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-3 mt-2">
                  <code className="text-sm text-emerald-400 font-mono break-all">
                    {generatedMnemonic}
                  </code>
                </div>
                <button
                  onClick={() => copyToClipboard(generatedMnemonic, 'Seed phrase')}
                  className="mt-2 text-sm text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Copy to clipboard
                </button>
              </div>
            )}

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Number of Wallets
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={walletCount}
                  onChange={(e) => setWalletCount(parseInt(e.target.value) || 1)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Derivation Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDerivationType('hd')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      derivationType === 'hd'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    HD (Recommended)
                  </button>
                  <button
                    onClick={() => setDerivationType('random')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      derivationType === 'random'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    Random
                  </button>
                </div>
              </div>

              {derivationType === 'hd' && (
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-400 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useExistingMnemonic}
                      onChange={(e) => setUseExistingMnemonic(e.target.checked)}
                      className="rounded border-gray-600"
                    />
                    Use existing seed phrase
                  </label>
                  
                  {useExistingMnemonic && (
                    <textarea
                      value={customMnemonic}
                      onChange={(e) => setCustomMnemonic(e.target.value)}
                      placeholder="Enter your 12 or 24 word seed phrase..."
                      rows={3}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGeneratedMnemonic(null);
                  setCustomMnemonic('');
                  setUseExistingMnemonic(false);
                }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateWallets}
                disabled={generating}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-white transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : generatedMnemonic ? (
                  'I Saved It - Close'
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-500" />
              Import Configuration
            </h2>

            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste your exported JSON configuration..."
              rows={8}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportData('');
                }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition-colors"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
