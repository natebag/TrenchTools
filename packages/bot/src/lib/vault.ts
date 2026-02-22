import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Keypair } from '@solana/web3.js';
import { encryptWallets, decryptWallets } from '@trenchtools/core';
import type { WalletData } from '@trenchtools/core';

let cachedWallets: WalletData[] | null = null;

const DEFAULT_VAULT_PATH = path.join(os.homedir(), '.trenchsniper', 'vault.json');

export async function ensureUnlocked(password: string, vaultPath?: string): Promise<WalletData[]> {
  if (cachedWallets) return cachedWallets;
  const filePath = vaultPath || DEFAULT_VAULT_PATH;
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const exportData = JSON.parse(raw);
    cachedWallets = await decryptWallets(exportData, password);
    return cachedWallets;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      cachedWallets = [];
      return cachedWallets;
    }
    throw err;
  }
}

export function getKeypairByAddress(wallets: WalletData[], address: string): Keypair {
  const w = wallets.find(w => w.publicKey === address);
  if (!w) throw new Error(`Wallet ${address} not found in vault`);
  const secretKey = w.secretKey instanceof Uint8Array ? w.secretKey : new Uint8Array(Object.values(w.secretKey));
  return Keypair.fromSecretKey(secretKey);
}

export function getDefaultWallet(wallets: WalletData[]): WalletData {
  if (wallets.length === 0) throw new Error('No wallets in vault. Generate wallets first.');
  return wallets[0];
}
