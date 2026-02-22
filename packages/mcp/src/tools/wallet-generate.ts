import { z } from 'zod';
import { CHAINS } from '@trenchtools/core';
import type { ChainId } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';
import { generateAndAddWallets } from '../vault.js';

export const toolName = 'trench_wallet_generate';
export const toolDescription = 'Generate new wallets and add them to the encrypted vault. Supports Solana (default), BSC, Base, and SUI chains. Returns the public keys of newly created wallets.';

export const toolSchema = z.object({
  count: z.number().int().min(1).max(100).describe('Number of wallets to generate (1-100)'),
  chain: z.enum(['solana', 'bsc', 'base', 'sui']).optional().default('solana').describe('Blockchain to generate wallets for'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const chain: ChainId = args.chain ?? 'solana';
  const chainConfig = CHAINS[chain];

  // Generate wallets for the target chain (Solana, EVM, or SUI)
  const newWallets = await generateAndAddWallets(config, args.count, chain);
  const publicKeys = newWallets.map(w => w.publicKey);

  const lines: string[] = [];
  lines.push(`Generated ${publicKeys.length} new ${chainConfig.name} wallet(s):`);
  lines.push('');

  for (let i = 0; i < publicKeys.length; i++) {
    lines.push(`  ${i + 1}. ${publicKeys[i]}`);
  }

  lines.push('');
  lines.push(`Wallets are encrypted and saved to vault. Use trench_wallet_fund to send ${chainConfig.nativeToken} to them.`);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
