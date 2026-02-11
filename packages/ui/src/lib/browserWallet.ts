/**
 * Browser Wallet Manager for TrenchSniper UI
 * 
 * Handles wallet generation, encryption, and storage entirely in the browser
 * using Web Crypto API (no Node dependencies)
 */

import { Keypair } from '@solana/web3.js';
import {
  BrowserWalletVault,
  type BrowserWalletData,
  BrowserDecryptionError,
  isBrowserCryptoAvailable,
} from '@trenchsniper/core';
import type { Wallet } from '@/types';

// ============ Types ============

export interface SecureWallet extends Wallet {
  /** Keypair available when unlocked */
  _keypair?: Keypair;
}

export interface WalletManagerState {
  isLocked: boolean;
  hasVault: boolean;
  walletCount: number;
}

// ============ Wallet Manager ============

/**
 * Browser-based wallet manager
 * Generates, encrypts, and stores wallets using Web Crypto API
 */
export class BrowserWalletManager {
  private vault: BrowserWalletVault;
  private keypairs: Map<string, Keypair> = new Map();
  
  constructor(storageKey = 'trenchsniper_secure_wallets') {
    if (!isBrowserCryptoAvailable()) {
      throw new Error('Web Crypto API not available. Use HTTPS or localhost.');
    }
    this.vault = new BrowserWalletVault(storageKey);
  }
  
  // ============ State ============
  
  /**
   * Get current manager state
   */
  getState(): WalletManagerState {
    return {
      isLocked: !this.vault.isUnlocked(),
      hasVault: this.vault.hasWallets(),
      walletCount: this.vault.getUnlockedWallets()?.length ?? 0,
    };
  }
  
  // ============ Vault Operations ============
  
  /**
   * Check if vault exists
   */
  hasVault(): boolean {
    return this.vault.hasWallets();
  }
  
  /**
   * Check if vault is unlocked
   */
  isUnlocked(): boolean {
    return this.vault.isUnlocked();
  }
  
  /**
   * Unlock vault with password
   */
  async unlock(password: string): Promise<Wallet[]> {
    try {
      const walletData = await this.vault.load(password);
      
      // Reconstruct keypairs and wallet objects
      this.keypairs.clear();
      return walletData.map(w => this.dataToWallet(w));
    } catch (error) {
      if (error instanceof BrowserDecryptionError) {
        throw new Error('Invalid password');
      }
      throw error;
    }
  }
  
  /**
   * Lock vault (clear keypairs from memory)
   */
  lock(): void {
    this.vault.lock();
    this.keypairs.clear();
  }
  
  /**
   * Delete vault entirely
   */
  deleteVault(): void {
    this.vault.delete();
    this.keypairs.clear();
  }
  
  // ============ Wallet Operations ============
  
  /**
   * Generate a new wallet
   */
  async generateWallet(
    name: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<Wallet> {
    // Generate keypair
    const keypair = Keypair.generate();
    
    // Create wallet data
    const walletData: BrowserWalletData = {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey),
      createdAt: Date.now(),
      name,
    };
    
    // Load existing wallets or create new vault
    let existingWallets: BrowserWalletData[] = [];
    if (this.vault.hasWallets()) {
      try {
        existingWallets = await this.vault.load(password);
      } catch (error) {
        if (error instanceof BrowserDecryptionError) {
          throw new Error('Invalid password');
        }
        throw error;
      }
    }
    
    // Add new wallet and save
    const allWallets = [...existingWallets, walletData];
    await this.vault.save(allWallets, password);
    
    // Store keypair in memory
    const wallet = this.dataToWallet(walletData, type);
    this.keypairs.set(wallet.id, keypair);
    
    return wallet;
  }
  
  /**
   * Generate multiple wallets at once
   */
  async generateWallets(
    count: number,
    namePrefix: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<Wallet[]> {
    const newWallets: BrowserWalletData[] = [];
    
    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate();
      newWallets.push({
        publicKey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey),
        createdAt: Date.now(),
        name: `${namePrefix} ${i + 1}`,
      });
    }
    
    // Load existing or start fresh
    let existingWallets: BrowserWalletData[] = [];
    if (this.vault.hasWallets()) {
      try {
        existingWallets = await this.vault.load(password);
      } catch (error) {
        if (error instanceof BrowserDecryptionError) {
          throw new Error('Invalid password');
        }
        throw error;
      }
    }
    
    // Save all
    const allWallets = [...existingWallets, ...newWallets];
    await this.vault.save(allWallets, password);
    
    // Convert and store keypairs
    return newWallets.map(w => {
      const wallet = this.dataToWallet(w, type);
      const keypair = Keypair.fromSecretKey(new Uint8Array(w.secretKey));
      this.keypairs.set(wallet.id, keypair);
      return wallet;
    });
  }
  
  /**
   * Import wallet from secret key
   */
  async importWallet(
    secretKey: Uint8Array,
    name: string,
    type: 'sniper' | 'treasury' | 'burner',
    password: string
  ): Promise<Wallet> {
    const keypair = Keypair.fromSecretKey(secretKey);
    
    const walletData: BrowserWalletData = {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: Array.from(keypair.secretKey),
      createdAt: Date.now(),
      name,
    };
    
    // Load existing or start fresh
    let existingWallets: BrowserWalletData[] = [];
    if (this.vault.hasWallets()) {
      existingWallets = await this.vault.load(password);
    }
    
    // Check for duplicate
    if (existingWallets.some(w => w.publicKey === walletData.publicKey)) {
      throw new Error('Wallet already exists');
    }
    
    // Save
    await this.vault.save([...existingWallets, walletData], password);
    
    const wallet = this.dataToWallet(walletData, type);
    this.keypairs.set(wallet.id, keypair);
    
    return wallet;
  }
  
  /**
   * Remove a wallet
   */
  async removeWallet(walletId: string, password: string): Promise<void> {
    const wallets = await this.vault.load(password);
    const filtered = wallets.filter(w => {
      const id = `wallet_${w.publicKey.slice(0, 8)}`;
      return id !== walletId;
    });
    
    if (filtered.length === wallets.length) {
      throw new Error('Wallet not found');
    }
    
    await this.vault.save(filtered, password);
    this.keypairs.delete(walletId);
  }
  
  /**
   * Get keypair for signing (must be unlocked)
   */
  getKeypair(walletId: string): Keypair | undefined {
    return this.keypairs.get(walletId);
  }
  
  /**
   * Get all keypairs (must be unlocked)
   */
  getAllKeypairs(): Keypair[] {
    return Array.from(this.keypairs.values());
  }
  
  // ============ Export/Import ============
  
  /**
   * Export encrypted backup
   */
  async exportBackup(password: string): Promise<string> {
    return this.vault.export(password);
  }
  
  /**
   * Import from encrypted backup
   */
  async importBackup(backup: string, password: string): Promise<Wallet[]> {
    const walletData = await this.vault.import(backup, password);
    this.keypairs.clear();
    return walletData.map(w => this.dataToWallet(w));
  }
  
  /**
   * Change vault password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.vault.changePassword(oldPassword, newPassword);
  }
  
  // ============ Helpers ============
  
  /**
   * Convert BrowserWalletData to Wallet type used by UI
   */
  private dataToWallet(
    data: BrowserWalletData,
    type: 'sniper' | 'treasury' | 'burner' = 'sniper'
  ): Wallet {
    // Reconstruct keypair and store
    const keypair = Keypair.fromSecretKey(new Uint8Array(data.secretKey));
    const id = `wallet_${data.publicKey.slice(0, 8)}`;
    this.keypairs.set(id, keypair);
    
    return {
      id,
      address: data.publicKey,
      name: data.name || `Wallet ${data.publicKey.slice(0, 4)}`,
      balance: 0,  // Will be fetched separately
      encrypted: true,
      type,
    };
  }
}

// ============ Singleton Instance ============

let managerInstance: BrowserWalletManager | null = null;

/**
 * Get the global wallet manager instance
 */
export function getWalletManager(): BrowserWalletManager {
  if (!managerInstance) {
    managerInstance = new BrowserWalletManager();
  }
  return managerInstance;
}

/**
 * Reset the manager (useful for testing)
 */
export function resetWalletManager(): void {
  if (managerInstance) {
    managerInstance.lock();
  }
  managerInstance = null;
}
