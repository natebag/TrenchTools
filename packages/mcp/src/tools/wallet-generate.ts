import { z } from 'zod';
import { isEvmChain, generateEvmWallets, CHAINS } from '@trenchtools/core';
import type { ChainId } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';
import { generateAndAddWallets, addWallets } from '../vault.js';

export const toolName = 'trench_wallet_generate';
export const toolDescription = 'Generate new wallets and add them to the encrypted vault. Supports Solana (default), BSC, and Base chains. Returns the public keys of newly created wallets.';

export const toolSchema = z.object({
  count: z.number().int().min(1).max(100).describe('Number of wallets to generate (1-100)'),
  chain: z.enum(['solana', 'bsc', 'base']).optional().default('solana').describe('Blockchain to generate wallets for'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const chain: ChainId = args.chain ?? 'solana';
  const chainConfig = CHAINS[chain];

  let publicKeys: string[];

  if (isEvmChain(chain)) {
    // Generate EVM wallets (BSC, Base)
    const evmWallets = generateEvmWallets(args.count, chain);
    await addWallets(config, evmWallets);
    publicKeys = evmWallets.map(w => w.publicKey);
  } else {
    // Generate Solana wallets (existing path)
    const newWallets = await generateAndAddWallets(config, args.count);
    publicKeys = newWallets.map(w => w.publicKey);
  }

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
