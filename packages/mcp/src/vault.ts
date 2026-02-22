import * as fs from 'fs/promises';
import * as path from 'path';
import { Keypair } from '@solana/web3.js';
import {
  encryptWallets,
  decryptWallets,
  generateRandom,
  keypairsToWalletData,
} from '@trenchtools/core';
import type { WalletData } from '@trenchtools/core';
import type { MCPConfig } from './config.js';

let cachedWallets: WalletData[] | null = null;

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureUnlocked(config: MCPConfig): Promise<WalletData[]> {
  if (cachedWallets) return cachedWallets;

  try {
    const raw = await fs.readFile(config.vaultPath, 'utf-8');
    const exportData = JSON.parse(raw);
    cachedWallets = await decryptWallets(exportData, config.vaultPassword);
    return cachedWallets;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // First run — create empty vault
      cachedWallets = [];
      await saveVault(config, []);
      return cachedWallets;
    }
    throw err;
  }
}

async function saveVault(config: MCPConfig, wallets: WalletData[]): Promise<void> {
  await ensureDir(config.vaultPath);
  const encrypted = await encryptWallets(wallets, config.vaultPassword);
  await fs.writeFile(config.vaultPath, JSON.stringify(encrypted, null, 2), 'utf-8');
  cachedWallets = wallets;
}

export async function addWallets(config: MCPConfig, newWallets: WalletData[]): Promise<void> {
  const existing = await ensureUnlocked(config);
  await saveVault(config, [...existing, ...newWallets]);
}

export async function generateAndAddWallets(config: MCPConfig, count: number): Promise<WalletData[]> {
  const keypairs = generateRandom(count);
  const walletData = keypairsToWalletData(keypairs);
  await addWallets(config, walletData);
  return walletData;
}

export function getKeypairByAddress(wallets: WalletData[], address: string): Keypair {
  const w = wallets.find(w => w.publicKey === address);
  if (!w) throw new Error(`Wallet ${address} not found in vault`);
  const secretKey = w.secretKey instanceof Uint8Array ? w.secretKey : new Uint8Array(Object.values(w.secretKey));
  return Keypair.fromSecretKey(secretKey);
}

export function getDefaultWallet(wallets: WalletData[]): WalletData {
  if (wallets.length === 0) throw new Error('No wallets in vault. Use trench_wallet_generate to create one.');
  return wallets[0];
}

export async function removeWallets(config: MCPConfig, addresses: string[]): Promise<void> {
  const existing = await ensureUnlocked(config);
  const addressSet = new Set(addresses);
  const remaining = existing.filter(w => !addressSet.has(w.publicKey));
  await saveVault(config, remaining);
}
