import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked } from '../vault.js';

export const toolName = 'trench_wallet_list';
export const toolDescription = 'List all wallets in the vault with their SOL balances. Use this to see available wallets before trading.';

export const toolSchema = z.object({
  showBalances: z.boolean().optional().default(true).describe('Whether to fetch and show SOL balances (default: true)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const wallets = await ensureUnlocked(config);

  if (wallets.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No wallets in vault. Use trench_wallet_generate to create wallets.' }],
    };
  }

  const lines: string[] = [];
  lines.push(`Vault: ${wallets.length} wallet(s)`);
  lines.push('');

  if (args.showBalances) {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    lines.push('  #  Address                                        Balance');
    lines.push('---  ---------------------------------------------  ------------');

    for (let i = 0; i < wallets.length; i++) {
      const addr = wallets[i].publicKey;
      const truncated = addr.slice(0, 4) + '...' + addr.slice(-4);
      try {
        const balance = await connection.getBalance(
          new PublicKey(addr),
          'confirmed'
        );
        const sol = balance / LAMPORTS_PER_SOL;
        lines.push(`${String(i).padStart(3)}  ${truncated.padEnd(45)}  ${sol.toFixed(4)} SOL`);
      } catch {
        lines.push(`${String(i).padStart(3)}  ${truncated.padEnd(45)}  (error)`);
      }
    }
  } else {
    lines.push('  #  Address');
    lines.push('---  ---------------------------------------------');
    for (let i = 0; i < wallets.length; i++) {
      const addr = wallets[i].publicKey;
      const truncated = addr.slice(0, 4) + '...' + addr.slice(-4);
      lines.push(`${String(i).padStart(3)}  ${truncated}`);
    }
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
