import { z } from 'zod';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress } from '../vault.js';

export const toolName = 'trench_wallet_fund';
export const toolDescription = 'Send SOL from one vault wallet to one or more destination addresses. Useful for distributing SOL to bot wallets before trading.';

export const toolSchema = z.object({
  fromAddress: z.string().describe('Source wallet address (must be in vault)'),
  toAddresses: z.array(z.string()).min(1).describe('Array of destination wallet addresses'),
  amountSol: z.number().positive().describe('Amount of SOL to send to each address'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const { fromAddress, toAddresses, amountSol } = args;

  const wallets = await ensureUnlocked(config);
  const fromKeypair = getKeypairByAddress(wallets, fromAddress);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const totalNeeded = lamports * toAddresses.length;

  // Check balance
  const balance = await connection.getBalance(fromKeypair.publicKey, 'confirmed');
  const totalNeededSol = (totalNeeded / LAMPORTS_PER_SOL).toFixed(4);
  const balanceSol = (balance / LAMPORTS_PER_SOL).toFixed(4);

  if (balance < totalNeeded + 5000 * toAddresses.length) {
    return {
      content: [{
        type: 'text' as const,
        text: `Insufficient balance. Need ~${totalNeededSol} SOL + fees, have ${balanceSol} SOL.`,
      }],
    };
  }

  const results: { address: string; signature?: string; error?: string }[] = [];
  let successCount = 0;

  for (const toAddr of toAddresses) {
    try {
      const toPubkey = new PublicKey(toAddr);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey,
          lamports,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = fromKeypair.publicKey;
      tx.sign(fromKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Poll confirmation
      let confirmed = false;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statusResp = await connection.getSignatureStatuses([signature]);
        const status = statusResp.value[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      }

      if (!confirmed) {
        throw new Error('Transaction not confirmed after 20s');
      }

      results.push({ address: toAddr, signature });
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ address: toAddr, error: message });
    }
  }

  const lines: string[] = [];
  lines.push(`Funded ${successCount}/${toAddresses.length} wallet(s) with ${amountSol.toFixed(4)} SOL each`);
  lines.push('');

  for (const r of results) {
    const truncated = r.address.slice(0, 4) + '...' + r.address.slice(-4);
    if (r.signature) {
      lines.push(`  ${truncated}: OK (${r.signature.slice(0, 12)}...)`);
    } else {
      lines.push(`  ${truncated}: FAILED - ${r.error}`);
    }
  }

  if (successCount > 0) {
    const totalSent = (successCount * amountSol).toFixed(4);
    lines.push('');
    lines.push(`Total sent: ${totalSent} SOL`);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
