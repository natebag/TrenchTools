/**
 * WalletManagerBrowser - Browser-Compatible Wallet Management
 * TrenchSniper OS
 * 
 * Uses Web Crypto API for encryption (no Node.js dependencies)
 * Generates wallets using @solana/web3.js Keypair
 * 
 * NOTE: HD derivation (mnemonic) requires Node.js - this version
 * generates random keypairs only. For HD wallets, use the desktop app.
 */

import { useState, useCallback } from 'react';
import {
  Wallet,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Copy,
  AlertCircle,
  Loader2,
  CheckCircle,
  Shield,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { isRotationManagedWallet } from '@/lib/volumeRotation';

export function WalletManagerBrowser() {
  const { rpcUrl } = useNetwork();
  const {
    wallets,
    isLocked,
    hasVault,
    isLoading,
    error: walletError,
    unlock,
    lock,
    generateWallet,
    generateWallets,
    importWallet,
    removeWallet,
    refreshBalances,
    exportBackup,
    importBackup,
    clearError,
  } = useSecureWallet({ rpcUrl });

  // UI State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal states
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportKeyModal, setShowImportKeyModal] = useState(false);
  const [showCreateVaultModal, setShowCreateVaultModal] = useState(false);
  
  // Form states
  const [walletCount, setWalletCount] = useState(3);
  const [walletNamePrefix, setWalletNamePrefix] = useState('Sniper');
  const [walletType, setWalletType] = useState<'sniper' | 'treasury' | 'burner'>('sniper');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importData, setImportData] = useState('');
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importWalletName, setImportWalletName] = useState('Imported Wallet');

  // Copy to clipboard helper
  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setSuccess(`${label} copied!`);
    setTimeout(() => setSuccess(null), 2000);
  }, []);

  // Create new vault
  const handleCreateVault = useCallback(async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      await generateWallet('Treasury', 'treasury', password);
      setShowCreateVaultModal(false);
      setPassword('');
      setConfirmPassword('');
      setSuccess('Vault created with treasury wallet!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [password, confirmPassword, generateWallet]);

  // Unlock vault
  const handleUnlock = useCallback(async () => {
    try {
      await unlock(password);
      setShowUnlockModal(false);
      setPassword('');
      setSuccess('Vault unlocked!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [password, unlock]);

  // Generate wallets
  const handleGenerateWallets = useCallback(async () => {
    if (!password) {
      setError('Password required');
      return;
    }

    try {
      if (walletCount === 1) {
        await generateWallet(walletNamePrefix, walletType, password);
      } else {
        await generateWallets(walletCount, walletNamePrefix, walletType, password);
      }
      setShowGenerateModal(false);
      setPassword('');
      setSuccess(`Generated ${walletCount} wallet${walletCount > 1 ? 's' : ''}!`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [walletCount, walletNamePrefix, walletType, password, generateWallet, generateWallets]);

  // Delete wallet
  const handleDeleteWallet = useCallback(async (walletId: string) => {
    const pwd = prompt('Enter password to delete wallet:');
    if (!pwd) return;

    try {
      await removeWallet(walletId, pwd);
      setSuccess('Wallet removed!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [removeWallet]);

  // Export backup
  const handleExport = useCallback(async () => {
    const pwd = prompt('Enter password to export:');
    if (!pwd) return;

    try {
      const backup = await exportBackup(pwd);
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trenchsniper-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Backup exported!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [exportBackup]);

  // Import backup
  const handleImport = useCallback(async () => {
    if (!importData || !password) {
      setError('Backup data and password required');
      return;
    }

    try {
      await importBackup(importData, password);
      setShowImportModal(false);
      setImportData('');
      setPassword('');
      setSuccess('Backup imported!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [importData, password, importBackup]);

  // Import from private key (JSON array format)
  const handleImportPrivateKey = useCallback(async () => {
    if (!importPrivateKey || !password) {
      setError('Private key and password required');
      return;
    }

    try {
      // Parse the private key - expect JSON array format
      const keyArray = JSON.parse(importPrivateKey);
      const secretKey = new Uint8Array(keyArray);
      
      await importWallet(secretKey, importWalletName, walletType, password);
      setShowImportKeyModal(false);
      setImportPrivateKey('');
      setImportWalletName('Imported Wallet');
      setSuccess('Wallet imported!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [importPrivateKey, importWalletName, walletType, password, importWallet]);

  // Clear any errors
  const dismissError = useCallback(() => {
    setError(null);
    clearError();
  }, [clearError]);

  // Render wallet card
  const renderWalletCard = (wallet: typeof wallets[0]) => (
    <div
      key={wallet.id}
      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            wallet.type === 'treasury' ? 'bg-yellow-500' :
            wallet.type === 'sniper' ? 'bg-green-500' : 'bg-blue-500'
          }`} />
          <span className="font-medium">{wallet.name}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
            {wallet.type}
          </span>
        </div>
        <button
          onClick={() => handleDeleteWallet(wallet.id)}
          className="text-gray-400 hover:text-red-400 p-1"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">Address:</span>
          <code className="text-xs bg-gray-700 px-2 py-1 rounded flex-1 truncate">
            {wallet.address}
          </code>
          <button
            onClick={() => copyToClipboard(wallet.address, 'Address')}
            className="text-gray-400 hover:text-white p-1"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Balance:</span>
          <span className="font-mono">{wallet.balance.toFixed(4)} SOL</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400 text-sm">Encrypted:</span>
          <span className="flex items-center gap-1 text-green-400">
            <Shield className="w-4 h-4" />
            Yes
          </span>
        </div>
      </div>
    </div>
  );

  const standardWallets = wallets.filter(wallet => !isRotationManagedWallet(wallet.name));
  const rotationManagedWallets = wallets.filter(wallet => isRotationManagedWallet(wallet.name));

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-bold">Secure Wallet Manager</h2>
          {isLocked ? (
            <Lock className="w-5 h-5 text-red-400" />
          ) : (
            <Unlock className="w-5 h-5 text-green-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasVault ? (
            <button
              onClick={() => setShowCreateVaultModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Create Vault
            </button>
          ) : isLocked ? (
            <button
              onClick={() => setShowUnlockModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg"
            >
              <Unlock className="w-4 h-4" />
              Unlock
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Generate
              </button>
              <button
                onClick={refreshBalances}
                disabled={isLoading}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleExport}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
                title="Import Backup"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowImportKeyModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm"
                title="Import Private Key"
              >
                <Shield className="w-4 h-4" />
                Import Key
              </button>
              <button
                onClick={lock}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg"
              >
                <Lock className="w-4 h-4" />
                Lock
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alerts */}
      {(error || walletError) && (
        <div className="flex items-center gap-2 p-4 mb-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5" />
          <span>{error || walletError}</span>
          <button onClick={dismissError} className="ml-auto hover:text-white">×</button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 mb-4 bg-green-900/30 border border-green-800 rounded-lg text-green-300">
          <CheckCircle className="w-5 h-5" />
          <span>{success}</span>
        </div>
      )}

      {/* No Vault State */}
      {!hasVault && (
        <div className="text-center py-12 text-gray-400">
          <Shield className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium mb-2">No Wallet Vault</h3>
          <p className="mb-4">Create an encrypted vault to securely store your wallets.</p>
          <button
            onClick={() => setShowCreateVaultModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Create Vault
          </button>
        </div>
      )}

      {/* Locked State */}
      {hasVault && isLocked && (
        <div className="text-center py-12 text-gray-400">
          <Lock className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium mb-2">Vault Locked</h3>
          <p className="mb-4">Enter your password to access wallets.</p>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg"
          >
            <Unlock className="w-5 h-5" />
            Unlock Vault
          </button>
        </div>
      )}

      {/* Wallets Grid */}
      {!isLocked && wallets.length > 0 && (
        <div className="space-y-6">
          {standardWallets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Primary Wallets</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {standardWallets.map(renderWalletCard)}
              </div>
            </div>
          )}
          {rotationManagedWallets.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-300 mb-3">
                Managed Rotation Wallets ({rotationManagedWallets.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rotationManagedWallets.map(renderWalletCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State (unlocked but no wallets) */}
      {!isLocked && wallets.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Wallet className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium mb-2">No Wallets</h3>
          <p className="mb-4">Generate your first wallet to get started.</p>
          <button
            onClick={() => setShowGenerateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg"
          >
            <Plus className="w-5 h-5" />
            Generate Wallet
          </button>
        </div>
      )}

      {/* Create Vault Modal */}
      {showCreateVaultModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-lg font-bold mb-4">Create Secure Vault</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Password (min 8 characters)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="Enter password"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="Confirm password"
                />
              </div>

              <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3 text-sm text-yellow-300">
                <strong>⚠️ Important:</strong> This password encrypts your wallet keys locally.
                If you lose it, your wallets cannot be recovered!
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateVaultModal(false);
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVault}
                disabled={isLoading || password.length < 8 || password !== confirmPassword}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Vault'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-lg font-bold mb-4">Unlock Vault</h3>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                placeholder="Enter password"
                autoFocus
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUnlockModal(false);
                  setPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                disabled={isLoading || !password}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-lg font-bold mb-4">Generate Wallets</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Number of Wallets</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={walletCount}
                  onChange={(e) => setWalletCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Name Prefix</label>
                <input
                  type="text"
                  value={walletNamePrefix}
                  onChange={(e) => setWalletNamePrefix(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="e.g., Sniper"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Wallet Type</label>
                <select
                  value={walletType}
                  onChange={(e) => setWalletType(e.target.value as 'sniper' | 'treasury' | 'burner')}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                >
                  <option value="sniper">Sniper</option>
                  <option value="treasury">Treasury</option>
                  <option value="burner">Burner</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="Enter vault password"
                />
              </div>

              <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3 text-sm text-blue-300">
                <strong>ℹ️ Note:</strong> Wallets are generated using secure random keypairs.
                For HD wallet derivation (mnemonic), use the desktop app.
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateWallets}
                disabled={isLoading || !password}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-lg font-bold mb-4">Import Backup</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Backup Data (JSON)</label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none h-32 font-mono text-sm"
                  placeholder="Paste encrypted backup JSON..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="Enter backup password"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportData('');
                  setPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isLoading || !importData || !password}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Private Key Modal */}
      {showImportKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-gray-800">
            <h3 className="text-lg font-bold mb-4">Import Private Key</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Wallet Name</label>
                <input
                  type="text"
                  value={importWalletName}
                  onChange={(e) => setImportWalletName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="My Wallet"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Private Key (JSON Array)</label>
                <textarea
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none h-24 font-mono text-xs"
                  placeholder="[240,5,159,18,73,...]"
                />
                <p className="text-xs text-gray-500 mt-1">Paste the secret key as a JSON array of numbers</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Vault Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="Enter your vault password"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImportKeyModal(false);
                  setImportPrivateKey('');
                  setPassword('');
                }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleImportPrivateKey}
                disabled={isLoading || !importPrivateKey || !password}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WalletManagerBrowser;
