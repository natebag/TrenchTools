/**
 * EVM Wallet Generator
 *
 * Uses viem for key generation and account creation.
 * Produces secp256k1 keypairs compatible with BSC, Base, and any EVM chain.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { WalletData } from './types.js';
import type { ChainId } from '../chains/types.js';

/** EVM BIP-44 derivation path template (m/44'/60'/{index}'/0/0) */
export const EVM_DERIVATION_PATH = (index: number): string =>
  `m/44'/60'/${index}'/0/0`;

export interface EvmWalletResult {
  /** 0x-prefixed hex address */
  address: string;
  /** Raw 32-byte private key */
  privateKey: Uint8Array;
  /** 0x-prefixed hex private key */
  privateKeyHex: `0x${string}`;
}

/**
 * Generate a single random EVM wallet.
 */
export function generateEvmWallet(): EvmWalletResult {
  const privateKeyHex = generatePrivateKey();
  const account = privateKeyToAccount(privateKeyHex);

  // Convert hex private key to Uint8Array (strip 0x prefix)
  const hexStr = privateKeyHex.slice(2);
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    privateKey[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }

  return {
    address: account.address,
    privateKey,
    privateKeyHex,
  };
}

/**
 * Reconstruct an EVM account from a raw 32-byte secret key.
 */
export function evmAccountFromSecret(secretKey: Uint8Array): {
  address: string;
  privateKeyHex: `0x${string}`;
} {
  const hex = Array.from(secretKey)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const privateKeyHex = `0x${hex}` as `0x${string}`;
  const account = privateKeyToAccount(privateKeyHex);
  return { address: account.address, privateKeyHex };
}

/**
 * Generate multiple EVM wallets and return them as WalletData[].
 */
export function generateEvmWallets(
  count: number,
  chain: ChainId = 'bsc',
): WalletData[] {
  const wallets: WalletData[] = [];
  for (let i = 0; i < count; i++) {
    const result = generateEvmWallet();
    wallets.push({
      publicKey: result.address,
      secretKey: result.privateKey,
      createdAt: Date.now(),
      chain,
    });
  }
  return wallets;
}
