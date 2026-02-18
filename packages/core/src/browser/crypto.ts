/**
 * Browser-Compatible Crypto for TrenchSniper
 * 
 * Uses Web Crypto API instead of Node's crypto + argon2
 * Safe to import in Vite/browser environments
 * 
 * Security: PBKDF2 with 100k iterations + AES-256-GCM
 * (Argon2 would be better but requires WASM, keeping it simple)
 */

// ============ Types ============

export interface BrowserEncryptedData {
  version: number;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: number[];      // Uint8Array as JSON-safe array
  iv: number[];        // Uint8Array as JSON-safe array
  ciphertext: number[]; // Uint8Array as JSON-safe array
  created: string;
}

export interface BrowserWalletData {
  publicKey: string;
  secretKey: number[];  // Uint8Array as JSON-safe array
  createdAt: number;
  name?: string;\n  type?: 'sniper' | 'treasury' | 'burner';\n}

export interface BrowserWalletExport {
  version: number;
  created: string;
  encrypted: boolean;
  data: string;  // Base64 encoded encrypted JSON
  kdf: 'PBKDF2';
  kdfParams: {
    iterations: number;
    hash: 'SHA-256';
  };
  salt: string;  // Base64
  iv: string;    // Base64
}

// ============ Constants ============

const STORAGE_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;  // GCM standard
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 256;

// ============ Errors ============

export class BrowserCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserCryptoError';
  }
}

export class BrowserInvalidPasswordError extends BrowserCryptoError {
  constructor(message = 'Invalid password') {
    super(message);
    this.name = 'BrowserInvalidPasswordError';
  }
}

export class BrowserDecryptionError extends BrowserCryptoError {
  constructor(message = 'Decryption failed - wrong password or corrupted data') {
    super(message);
    this.name = 'BrowserDecryptionError';
  }
}

// ============ Validation ============

function validatePassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new BrowserInvalidPasswordError('Password is required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BrowserInvalidPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BrowserInvalidPasswordError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
}

// ============ Key Derivation ============

/**
 * Derive an AES-256 key from password using PBKDF2
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derive AES-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============ Encryption ============

/**
 * Encrypt plaintext string with password using AES-256-GCM + PBKDF2
 */
export async function encryptForBrowser(
  plaintext: string,
  password: string
): Promise<BrowserEncryptedData> {
  validatePassword(password);
  
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Derive key
  const key = await deriveKey(password, salt);
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return {
    version: STORAGE_VERSION,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    created: new Date().toISOString(),
  };
}

/**
 * Decrypt data encrypted with encryptForBrowser
 */
export async function decryptForBrowser(
  encrypted: BrowserEncryptedData,
  password: string
): Promise<string> {
  validatePassword(password);
  
  if (encrypted.version !== STORAGE_VERSION) {
    throw new BrowserCryptoError(`Unsupported version: ${encrypted.version}`);
  }
  
  const salt = new Uint8Array(encrypted.salt);
  const iv = new Uint8Array(encrypted.iv);
  const ciphertext = new Uint8Array(encrypted.ciphertext);
  
  // Derive same key
  const key = await deriveKey(password, salt, encrypted.iterations);
  
  try {
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    // AES-GCM throws on auth failure (wrong password)
    throw new BrowserDecryptionError();
  }
}

// ============ Wallet-Specific Functions ============

/**
 * Encrypt wallet data for browser storage
 */
export async function encryptWalletsForBrowser(
  wallets: BrowserWalletData[],
  password: string
): Promise<BrowserWalletExport> {
  validatePassword(password);
  
  // Serialize wallet data
  const plaintext = JSON.stringify(wallets);
  
  // Encrypt
  const encrypted = await encryptForBrowser(plaintext, password);
  
  // Convert to export format with base64 encoding for compact storage
  return {
    version: STORAGE_VERSION,
    created: encrypted.created,
    encrypted: true,
    data: arrayToBase64(encrypted.ciphertext),
    kdf: 'PBKDF2',
    kdfParams: {
      iterations: encrypted.iterations,
      hash: 'SHA-256',
    },
    salt: arrayToBase64(encrypted.salt),
    iv: arrayToBase64(encrypted.iv),
  };
}

/**
 * Decrypt wallet data from browser storage
 */
export async function decryptWalletsForBrowser(
  exported: BrowserWalletExport,
  password: string
): Promise<BrowserWalletData[]> {
  validatePassword(password);
  
  if (!exported.encrypted) {
    throw new BrowserCryptoError('Data is not encrypted');
  }
  
  // Reconstruct encrypted data structure
  const encrypted: BrowserEncryptedData = {
    version: exported.version,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: exported.kdfParams.iterations,
    salt: base64ToArray(exported.salt),
    iv: base64ToArray(exported.iv),
    ciphertext: base64ToArray(exported.data),
    created: exported.created,
  };
  
  // Decrypt
  const plaintext = await decryptForBrowser(encrypted, password);
  
  // Parse and validate
  try {
    const wallets = JSON.parse(plaintext) as BrowserWalletData[];
    
    // Basic validation
    if (!Array.isArray(wallets)) {
      throw new BrowserCryptoError('Invalid wallet data format');
    }
    
    return wallets;
  } catch (error) {
    if (error instanceof BrowserCryptoError) throw error;
    throw new BrowserCryptoError('Failed to parse decrypted wallet data');
  }
}

// ============ Utility Functions ============

/**
 * Convert number array to base64 string
 */
function arrayToBase64(arr: number[]): string {
  const uint8 = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to number array
 */
function base64ToArray(base64: string): number[] {
  const binary = atob(base64);
  const arr: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    arr.push(binary.charCodeAt(i));
  }
  return arr;
}

/**
 * Generate a random wallet ID
 */
export function generateWalletId(): string {
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return `wallet_${Date.now()}_${Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Check if Web Crypto API is available
 */
export function isBrowserCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && 
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues === 'function';
}

// ============ Browser Wallet Vault ============

/**
 * Browser-compatible wallet vault using localStorage
 */
export class BrowserWalletVault {
  private storageKey: string;
  private unlockedWallets: BrowserWalletData[] | null = null;
  
  constructor(storageKey = 'trenchsniper_wallets_encrypted') {
    this.storageKey = storageKey;
    
    if (!isBrowserCryptoAvailable()) {
      throw new BrowserCryptoError('Web Crypto API not available');
    }
  }
  
  /**
   * Check if vault has stored wallets
   */
  hasWallets(): boolean {
    return localStorage.getItem(this.storageKey) !== null;
  }
  
  /**
   * Save wallets with encryption
   */
  async save(wallets: BrowserWalletData[], password: string): Promise<void> {
    const exported = await encryptWalletsForBrowser(wallets, password);
    localStorage.setItem(this.storageKey, JSON.stringify(exported));
    this.unlockedWallets = wallets;
  }
  
  /**
   * Load and decrypt wallets
   */
  async load(password: string): Promise<BrowserWalletData[]> {
    const data = localStorage.getItem(this.storageKey);
    if (!data) {
      throw new BrowserCryptoError('No wallet data found');
    }
    
    const exported = JSON.parse(data) as BrowserWalletExport;
    const wallets = await decryptWalletsForBrowser(exported, password);
    this.unlockedWallets = wallets;
    return wallets;
  }
  
  /**
   * Get currently unlocked wallets
   */
  getUnlockedWallets(): BrowserWalletData[] | null {
    return this.unlockedWallets;
  }
  
  /**
   * Lock vault (clear from memory)
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
  delete(): void {
    localStorage.removeItem(this.storageKey);
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
   * Export wallets as encrypted JSON string (for backup)
   */
  async export(password: string): Promise<string> {
    const wallets = this.unlockedWallets ?? await this.load(password);
    const exported = await encryptWalletsForBrowser(wallets, password);
    return JSON.stringify(exported, null, 2);
  }
  
  /**
   * Import wallets from encrypted JSON string
   */
  async import(exportedData: string, password: string): Promise<BrowserWalletData[]> {
    const parsed = JSON.parse(exportedData) as BrowserWalletExport;
    const wallets = await decryptWalletsForBrowser(parsed, password);
    await this.save(wallets, password);
    return wallets;
  }
}
