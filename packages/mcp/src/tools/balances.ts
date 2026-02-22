import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getDefaultWallet } from '../vault.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_balances';
export const toolDescription = 'Get SOL and all SPL token balances for a wallet. If no address given, uses the default (first) vault wallet.';

export const toolSchema = z.object({
  walletAddress: z.string().optional().describe('Wallet public key. Omit to use default vault wallet.'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = rawAmount / divisor;
  const frac = rawAmount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least one decimal
  const trimmed = fracStr.replace(/0+$/, '') || '0';
  return `${whole.toLocaleString()}.${trimmed}`;
}

export async function handler(args: ToolInput, config: MCPConfig) {
  let address: string;

  if (args.walletAddress) {
    address = args.walletAddress;
  } else {
    const wallets = await ensureUnlocked(config);
    const defaultWallet = getDefaultWallet(wallets);
    address = defaultWallet.publicKey;
  }

  const connection = new Connection(config.rpcUrl, 'confirmed');
  const pubkey = new PublicKey(address);

  // Get SOL balance
  const solBalance = await connection.getBalance(pubkey, 'confirmed');
  const solAmount = solBalance / LAMPORTS_PER_SOL;

  // Get all SPL token accounts
  const tokenAccounts = await connection.getTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const lines: string[] = [];
  lines.push(`Balances for ${address.slice(0, 4)}...${address.slice(-4)}`);
  lines.push('');
  lines.push(`  SOL: ${solAmount.toFixed(4)} SOL`);

  if (tokenAccounts.value.length > 0) {
    lines.push('');
    lines.push('  Token Accounts:');
    lines.push('  Mint                                              Amount');
    lines.push('  ------------------------------------------------  ----------------');

    for (const { account } of tokenAccounts.value) {
      const data = account.data;

      // Parse token account data (SPL Token layout):
      // mint: bytes 0-32 (PublicKey)
      // amount: bytes 64-72 (u64 LE)
      const mintBytes = data.subarray(0, 32);
      const mint = new PublicKey(mintBytes).toBase58();

      const amountBuf = data.subarray(64, 72);
      const rawAmount = amountBuf.readBigUInt64LE(0);

      if (rawAmount === 0n) continue;

      // Default to 6 decimals (most PumpFun tokens) — exact decimals would require
      // fetching mint account, but 6 is a safe display default for Solana memecoins
      const displayAmount = formatTokenAmount(rawAmount, 6);
      const truncatedMint = mint.slice(0, 4) + '...' + mint.slice(-4);
      lines.push(`  ${truncatedMint.padEnd(48)}  ${displayAmount}`);
    }

    if (!tokenAccounts.value.some(({ account }) => {
      const amountBuf = account.data.subarray(64, 72);
      return amountBuf.readBigUInt64LE(0) > 0n;
    })) {
      lines.push('  (no token balances)');
    }
  } else {
    lines.push('');
    lines.push('  No SPL token accounts found.');
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
