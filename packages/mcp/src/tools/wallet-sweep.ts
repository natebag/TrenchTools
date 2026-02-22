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

export const toolName = 'trench_wallet_sweep';
export const toolDescription = 'Sweep SOL from vault wallets to a single destination. Useful for consolidating funds after trading. Leaves a small rent-exempt reserve by default.';

export const toolSchema = z.object({
  toAddress: z.string().describe('Destination wallet address to sweep SOL into'),
  walletAddresses: z.array(z.string()).optional().describe('Specific wallet addresses to sweep from. Omit to sweep from ALL vault wallets.'),
  keepRentSol: z.number().min(0).optional().default(0.002).describe('SOL to leave behind for rent-exempt reserve (default: 0.002)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const { toAddress, keepRentSol = 0.002 } = args;
  const toPubkey = new PublicKey(toAddress);

  const wallets = await ensureUnlocked(config);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  // Determine which wallets to sweep
  let sweepAddresses: string[];
  if (args.walletAddresses && args.walletAddresses.length > 0) {
    sweepAddresses = args.walletAddresses;
  } else {
    // All vault wallets except the destination (if it's in the vault)
    sweepAddresses = wallets
      .map(w => w.publicKey)
      .filter(addr => addr !== toAddress);
  }

  if (sweepAddresses.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No wallets to sweep from.',
      }],
    };
  }

  const keepLamports = Math.round(keepRentSol * LAMPORTS_PER_SOL);
  const txFeeEstimate = 5000; // ~5000 lamports per tx fee

  const results: { address: string; swept?: number; signature?: string; error?: string }[] = [];
  let totalSwept = 0;
  let successCount = 0;

  for (const addr of sweepAddresses) {
    try {
      const keypair = getKeypairByAddress(wallets, addr);
      const balance = await connection.getBalance(keypair.publicKey, 'confirmed');

      const sendAmount = balance - keepLamports - txFeeEstimate;
      if (sendAmount <= 0) {
        results.push({
          address: addr,
          error: `Balance too low (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL)`,
        });
        continue;
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey,
          lamports: sendAmount,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = keypair.publicKey;
      tx.sign(keypair);

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

      const sweptSol = sendAmount / LAMPORTS_PER_SOL;
      results.push({ address: addr, swept: sweptSol, signature });
      totalSwept += sweptSol;
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ address: addr, error: message });
    }
  }

  const lines: string[] = [];
  lines.push(`Swept ${successCount}/${sweepAddresses.length} wallet(s) to ${toAddress.slice(0, 4)}...${toAddress.slice(-4)}`);
  lines.push('');

  for (const r of results) {
    const truncated = r.address.slice(0, 4) + '...' + r.address.slice(-4);
    if (r.signature) {
      lines.push(`  ${truncated}: ${r.swept!.toFixed(4)} SOL (${r.signature.slice(0, 12)}...)`);
    } else {
      lines.push(`  ${truncated}: SKIPPED - ${r.error}`);
    }
  }

  lines.push('');
  lines.push(`Total swept: ${totalSwept.toFixed(4)} SOL`);
  lines.push(`Rent reserve kept: ${keepRentSol.toFixed(4)} SOL per wallet`);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
