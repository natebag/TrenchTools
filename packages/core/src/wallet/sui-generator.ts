/**
 * SUI Wallet Generator
 *
 * Uses @mysten/sui for Ed25519 key generation.
 * Produces Ed25519 keypairs compatible with SUI mainnet.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { randomBytes } from 'crypto';
import type { WalletData } from './types.js';

/** SUI BIP-44 derivation path template (SLIP-0010: m/44'/784'/{index}'/0'/0') */
export const SUI_DERIVATION_PATH = (index: number): string =>
  `m/44'/784'/${index}'/0'/0'`;

export interface SuiWalletResult {
  /** 0x-prefixed SUI address (66 chars) */
  address: string;
  /** Raw 32-byte Ed25519 private key */
  privateKey: Uint8Array;
}

/**
 * Generate a single random SUI wallet.
 */
export function generateSuiWallet(): SuiWalletResult {
  // Generate 32 random bytes, then construct the keypair from those bytes.
  // This avoids needing to decode the bech32-encoded getSecretKey() string.
  const secretKey = new Uint8Array(randomBytes(32));
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  return {
    address: keypair.getPublicKey().toSuiAddress(),
    privateKey: secretKey,
  };
}

/**
 * Reconstruct a SUI Ed25519Keypair from a raw 32-byte secret key.
 */
export function suiKeypairFromSecret(secretKey: Uint8Array): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

/**
 * Generate multiple SUI wallets and return them as WalletData[].
 */
export function generateSuiWallets(count: number): WalletData[] {
  return Array.from({ length: count }, () => {
    const result = generateSuiWallet();
    return {
      publicKey: result.address,
      secretKey: result.privateKey,
      createdAt: Date.now(),
      chain: 'sui' as const,
    };
  });
}
