/**
 * TrenchSniper Wallet Storage
 * 
 * Production-grade encrypted wallet storage using:
 * - AES-256-GCM for encryption
 * - Argon2id for key derivation (32 byte salt, 3 iterations, 64MB memory)
 * 
 * NEVER stores plaintext keys!
 */

import { Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import type { WalletData, WalletExport } from './types.js';
import {
  AES_CONFIG,
  DecryptionError,
  InvalidPasswordError,
  InvalidFormatError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from './types.js';

// ============ Encryption Constants ============

const STORAGE_VERSION = 2;
const SALT_LENGTH = 32; // 256-bit salt
const ARGON2_OPTIONS = {
  type: argon2.argon2id, // Hybrid resistant to both side-channel and GPU attacks
  memoryCost: 65536,     // 64 MiB
  timeCost: 3,           // 3 iterations
  parallelism: 4,
  hashLength: 32,        // 256-bit key
};

// ============ Key Derivation ============

/**
 * Derive encryption key from password using Argon2id
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const hash = await argon2.hash(password, {
    ...ARGON2_OPTIONS,
    salt,
    raw: true,
  });
  return Buffer.from(hash);
}

/**
 * Validate password strength
 */
function validatePassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new InvalidPasswordError('Password is required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidPasswordError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
}

// ============ Encryption ============

/**
 * Encrypt wallet data with AES-256-GCM
 */
export async function encryptWallets(
  wallets: WalletData[],
  password: string
): Promise<WalletExport> {
  validatePassword(password);

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(AES_CONFIG.ivLength);

  // Derive key using Argon2id
  const key = await deriveKey(password, salt);

  // Serialize wallet data
  const plaintext = JSON.stringify(
    wallets.map(w => ({
      ...w,
      secretKey: Array.from(w.secretKey), // Convert Uint8Array to array for JSON
    }))
  );

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    version: STORAGE_VERSION,
    created: new Date().toISOString(),
    encrypted: true,
    wallets: encrypted,
    kdf: 'argon2id',
    kdfParams: {
      memoryCost: ARGON2_OPTIONS.memoryCost,
      timeCost: ARGON2_OPTIONS.timeCost,
      parallelism: ARGON2_OPTIONS.parallelism,
    },
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    salt: salt.toString('base64'),
  } as WalletExport & { salt: string };
}

/**
 * Decrypt wallet data with AES-256-GCM
 */
export async function decryptWallets(
  exportData: WalletExport & { salt?: string },
  password: string
): Promise<WalletData[]> {
  validatePassword(password);

  // Validate export format
  if (!exportData.encrypted) {
    // Handle unencrypted export (legacy or dev)
    if (Array.isArray(exportData.wallets)) {
      return exportData.wallets.map(w => ({
        ...w,
        secretKey: new Uint8Array(Object.values(w.secretKey)),
      }));
    }
    throw new InvalidFormatError('Invalid unencrypted export format');
  }

  if (!exportData.iv || !exportData.tag || !exportData.salt) {
    throw new InvalidFormatError('Missing encryption metadata');
  }

  if (typeof exportData.wallets !== 'string') {
    throw new InvalidFormatError('Encrypted data must be a string');
  }

  // Decode components
  const salt = Buffer.from(exportData.salt, 'base64');
  const iv = Buffer.from(exportData.iv, 'base64');
  const tag = Buffer.from(exportData.tag, 'base64');
  const encrypted = exportData.wallets;

  // Derive key using same parameters
  const key = await deriveKey(password, salt);

  // Decrypt with AES-256-GCM
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse and restore Uint8Array
    const parsed = JSON.parse(decrypted);
    return parsed.map((w: any) => ({
      ...w,
      secretKey: new Uint8Array(w.secretKey),
    }));
  } catch (error) {
    if ((error as Error).message?.includes('Unsupported state')) {
      throw new DecryptionError('Invalid password or corrupted data');
    }
    throw new DecryptionError(`Decryption failed: ${(error as Error).message}`);
  }
}

// ============ Storage Operations ============

export interface StorageAdapter {
  save(key: string, data: string): Promise<void>;
  load(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * In-memory storage adapter (for testing)
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private storage = new Map<string, string>();

  async save(key: string, data: string): Promise<void> {
    this.storage.set(key, data);
  }

  async load(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }
}

/**
 * File system storage adapter (Node.js)
 */
export class FileStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {}

  async save(key: string, data: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(filePath, data, 'utf8');
  }

  async load(key: string): Promise<string | null> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(this.basePath, `${key}.json`);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Secure wallet vault for managing encrypted wallet storage
 */
export class WalletVault {
  private adapter: StorageAdapter;
  private unlockedWallets: WalletData[] | null = null;
  private storageKey: string;

  constructor(adapter: StorageAdapter, storageKey = 'trenchsniper_wallets') {
    this.adapter = adapter;
    this.storageKey = storageKey;
  }

  /**
   * Check if vault has stored wallets
   */
  async hasWallets(): Promise<boolean> {
    return this.adapter.exists(this.storageKey);
  }

  /**
   * Save wallets with encryption
   */
  async save(wallets: WalletData[], password: string): Promise<void> {
    const exported = await encryptWallets(wallets, password);
    await this.adapter.save(this.storageKey, JSON.stringify(exported));
    this.unlockedWallets = wallets;
  }

  /**
   * Load and decrypt wallets
   */
  async load(password: string): Promise<WalletData[]> {
    const data = await this.adapter.load(this.storageKey);
    if (!data) {
      throw new InvalidFormatError('No wallet data found');
    }

    const exported = JSON.parse(data) as WalletExport & { salt?: string };
    const wallets = await decryptWallets(exported, password);
    this.unlockedWallets = wallets;
    return wallets;
  }

  /**
   * Get currently unlocked wallets (no password needed if already unlocked)
   */
  getUnlockedWallets(): WalletData[] | null {
    return this.unlockedWallets;
  }

  /**
   * Lock vault (clear unlocked wallets from memory)
   */
  lock(): void {
    this.unlockedWallets = null;
  }

  /**
   * Check if vault is unlocked
   */
  isUnlocked(): boolean {
    return this.unlockedWallets !== null;
  }

  /**
   * Delete all stored wallets
   */
  async delete(): Promise<void> {
    await this.adapter.delete(this.storageKey);
    this.unlockedWallets = null;
  }

  /**
   * Change vault password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const wallets = await this.load(oldPassword);
    await this.save(wallets, newPassword);
  }

  /**
   * Export wallets as encrypted blob (for backup)
   */
  async export(password: string): Promise<string> {
    const wallets = this.unlockedWallets ?? await this.load(password);
    const exported = await encryptWallets(wallets, password);
    return JSON.stringify(exported, null, 2);
  }

  /**
   * Import wallets from encrypted blob
   */
  async import(exportedData: string, password: string): Promise<WalletData[]> {
    const parsed = JSON.parse(exportedData) as WalletExport & { salt?: string };
    const wallets = await decryptWallets(parsed, password);
    await this.save(wallets, password);
    return wallets;
  }

  /**
   * Get wallet keypairs (for signing transactions)
   */
  getKeypairs(): Keypair[] {
    if (!this.unlockedWallets) {
      throw new Error('Vault is locked. Call load() first.');
    }
    return this.unlockedWallets.map(w => 
      Keypair.fromSecretKey(w.secretKey)
    );
  }
}

// ============ Helper Functions ============

/**
 * Create a new wallet vault with file storage
 */
export function createFileVault(basePath: string, storageKey?: string): WalletVault {
  return new WalletVault(new FileStorageAdapter(basePath), storageKey);
}

/**
 * Create a new wallet vault with memory storage (for testing)
 */
export function createMemoryVault(storageKey?: string): WalletVault {
  return new WalletVault(new MemoryStorageAdapter(), storageKey);
}
