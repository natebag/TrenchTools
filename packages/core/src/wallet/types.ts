/**
 * TrenchSniper Wallet Types
 * 
 * Type definitions for wallet management.
 * Ported from OrbitMM core package.
 */

import type { Keypair } from '@solana/web3.js';
import type { ChainId } from '../chains/types.js';

// ============ Constants ============

export const ARGON2_CONFIG = {
  memoryCost: 65536,  // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

export const AES_CONFIG = {
  algorithm: 'aes-256-gcm',
  ivLength: 16,
  tagLength: 16,
  keyLength: 32,
} as const;

export const BATCH_CONFIG = {
  maxConcurrent: 10,
  maxRetries: 3,
  retryDelayMs: 1000,
} as const;

export const MAX_WALLET_COUNT = 10000;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

// Solana derivation path: m/44'/501'/{index}'/0'
export const SOLANA_DERIVATION_PATH = (index: number): string => 
  `m/44'/501'/${index}'/0'`;

// ============ Core Types ============

export interface WalletData {
  publicKey: string;
  secretKey: Uint8Array;
  createdAt: number;
  derivationPath?: string;
  /** Chain this wallet belongs to. Defaults to 'solana' when absent (backward compat). */
  chain?: ChainId;
}

export interface WalletExport {
  version: number;
  created: string;
  encrypted: boolean;
  wallets: string | WalletData[];  // Encrypted base64 string or plain array
  kdf?: string;
  kdfParams?: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  salt?: string;
  iv?: string;
  tag?: string;
}

// ============ Options Types ============

export interface GenerateOptions {
  count: number;
  derivation?: 'random' | 'hd';
  hdSeed?: string;
  startIndex?: number;
}

export interface FundOptions {
  wallets: WalletData[];
  amountSol: number;
  sourceWallet: Keypair;
  priorityFee?: number | 'auto';
}

export interface FundResult {
  signatures: string[];
  totalCost: number;
  successCount: number;
  failCount: number;
}

export interface ConsolidateOptions {
  wallets: WalletData[];
  destinationWallet: WalletData;
  priorityFee?: number | 'auto';
  minBalance?: number; // Minimum balance to consolidate, defaults to 0
}

export interface ConsolidateResult {
  signatures: string[];
  totalConsolidated: number;
  successCount: number;
  failCount: number;
}

// ============ Balance Types ============

export interface Balance {
  publicKey: string;
  sol: number;
  tokens: TokenBalance[];
  lastUpdated: number;
}

export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

// ============ Error Classes ============

export class WalletError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletError';
  }
}

export class InvalidMnemonicError extends WalletError {
  constructor(message = 'Invalid mnemonic seed phrase') {
    super(message);
    this.name = 'InvalidMnemonicError';
  }
}

export class InvalidCountError extends WalletError {
  constructor(count: number) {
    super(`Invalid wallet count: ${count}. Must be between 0 and ${MAX_WALLET_COUNT}`);
    this.name = 'InvalidCountError';
  }
}

export class DerivationError extends WalletError {
  constructor(path: string, cause: Error) {
    super(`Failed to derive key at path ${path}: ${cause.message}`);
    this.name = 'DerivationError';
  }
}

export class InvalidPasswordError extends WalletError {
  constructor(message = 'Invalid password') {
    super(message);
    this.name = 'InvalidPasswordError';
  }
}

export class DecryptionError extends WalletError {
  constructor(message = 'Decryption failed') {
    super(message);
    this.name = 'DecryptionError';
  }
}

export class InvalidFormatError extends WalletError {
  constructor(message = 'Invalid wallet export format') {
    super(message);
    this.name = 'InvalidFormatError';
  }
}

export class EncryptionError extends WalletError {
  constructor(message = 'Encryption failed') {
    super(message);
    this.name = 'EncryptionError';
  }
}

export class InsufficientFundsError extends WalletError {
  constructor(required: number, available: number) {
    super(`Insufficient funds: need ${required} SOL, have ${available} SOL`);
    this.name = 'InsufficientFundsError';
  }
}

export class TransactionError extends WalletError {
  constructor(message: string, public signature?: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class InvalidAmountError extends WalletError {
  constructor(amount: number) {
    super(`Invalid amount: ${amount}`);
    this.name = 'InvalidAmountError';
  }
}

export class RPCError extends WalletError {
  constructor(message: string) {
    super(`RPC Error: ${message}`);
    this.name = 'RPCError';
  }
}
