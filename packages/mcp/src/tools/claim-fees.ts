import { z } from 'zod';
import { Connection } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress, getDefaultWallet } from '../vault.js';
import { claimCreatorFees } from '../lib/pumpfun-launch.js';

export const toolName = 'trench_claim_fees';
export const toolDescription = 'Claim accumulated PumpFun creator fees. Claims ALL fees at once (0.05%-0.95% dynamic rate based on market cap).';

export const toolSchema = z.object({
  walletAddress: z.string().optional().describe('Creator wallet. Omit for default vault wallet.'),
  priorityFee: z.number().min(0).max(0.01).optional().describe('Priority fee in SOL (default 0.000001)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  // Get wallet from vault
  const wallets = await ensureUnlocked(config);
  let walletAddress: string;
  if (args.walletAddress) {
    walletAddress = args.walletAddress;
  } else {
    const defaultWallet = getDefaultWallet(wallets);
    walletAddress = defaultWallet.publicKey;
  }
  const keypair = getKeypairByAddress(wallets, walletAddress);

  // Claim creator fees
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const result = await claimCreatorFees(connection, keypair, args.priorityFee);

  if (!result.success) {
    return {
      content: [{
        type: 'text' as const,
        text: `Fee claim failed: ${result.error}\n\nThis can happen if:\n  - No fees have accumulated yet\n  - The wallet is not a token creator on PumpFun\n  - The transaction was dropped (try again)`,
      }],
    };
  }

  const lines: string[] = [];
  lines.push('Creator fees claimed successfully!');
  lines.push('');
  lines.push(`  Wallet: ${walletAddress.slice(0, 8)}...`);
  lines.push(`  Tx: ${result.txHash}`);
  lines.push(`  Solscan: https://solscan.io/tx/${result.txHash}`);
  lines.push('');
  lines.push('  Note: Check your wallet balance to see the claimed amount.');
  lines.push('  PumpFun creator fees are 0.05%-0.95% of all trades (dynamic rate based on market cap).');

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
