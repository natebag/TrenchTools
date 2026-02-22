import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { generateAndAddWallets } from '../vault.js';

export const toolName = 'trench_wallet_generate';
export const toolDescription = 'Generate new Solana wallets and add them to the encrypted vault. Returns the public keys of newly created wallets.';

export const toolSchema = z.object({
  count: z.number().int().min(1).max(100).describe('Number of wallets to generate (1-100)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const newWallets = await generateAndAddWallets(config, args.count);

  const lines: string[] = [];
  lines.push(`Generated ${newWallets.length} new wallet(s):`);
  lines.push('');

  for (let i = 0; i < newWallets.length; i++) {
    lines.push(`  ${i + 1}. ${newWallets[i].publicKey}`);
  }

  lines.push('');
  lines.push('Wallets are encrypted and saved to vault. Use trench_wallet_fund to send SOL to them.');

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
