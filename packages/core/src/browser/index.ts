/**
 * Browser-Compatible Exports for TrenchSniper Core
 * 
 * Import from '@trenchtools/core/browser' in Vite/browser environments
 * to avoid Node-only dependencies like argon2
 */

export {
  // Types
  type BrowserEncryptedData,
  type BrowserWalletData,
  type BrowserWalletExport,
  
  // Errors
  BrowserCryptoError,
  BrowserInvalidPasswordError,
  BrowserDecryptionError,
  
  // Core functions
  encryptForBrowser,
  decryptForBrowser,
  encryptWalletsForBrowser,
  decryptWalletsForBrowser,
  
  // Utilities
  generateWalletId,
  isBrowserCryptoAvailable,
  
  // Vault class
  BrowserWalletVault,
} from './crypto.js';
