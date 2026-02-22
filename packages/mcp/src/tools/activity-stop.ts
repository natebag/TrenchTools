import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress } from '../vault.js';
import { getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';
import { getSessionsByType, stopSession, removeSession } from '../lib/sessions.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Activity tokens that may have been bought during the session.
 */
const ACTIVITY_TOKENS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   // JUP
];

export const toolName = 'trench_activity_stop';
export const toolDescription =
  'Stop the activity generation session early. Sells any held activity tokens back to SOL and returns final stats.';

export const toolSchema = z.object({});

export type ToolInput = z.infer<typeof toolSchema>;

function getDexConfig(config: MCPConfig): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps: config.slippageBps,
    heliusApiKey: config.heliusApiKey,
  };
}

async function getAllTokenBalances(
  connection: Connection,
  owner: PublicKey,
  mints: string[],
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const mintSet = new Set(mints);
  for (const { account } of tokenAccounts.value) {
    const data = account.data;
    const mintBytes = data.subarray(0, 32);
    const mint = new PublicKey(mintBytes).toBase58();
    if (mintSet.has(mint)) {
      const amount = data.subarray(64, 72).readBigUInt64LE(0);
      if (amount > 0n) result.set(mint, amount);
    }
  }
  return result;
}

export async function handler(_args: ToolInput, config: MCPConfig) {
  const sessions = getSessionsByType('activity');
  const running = sessions.filter(s => s.running);

  if (running.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No running activity session to stop.',
      }],
    };
  }

  const wallets = await ensureUnlocked(config);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const dexConfig = getDexConfig(config);
  const lines: string[] = [];

  for (const session of running) {
    stopSession(session.id);

    let sellCount = 0;
    let solRecovered = 0;

    // Sell any activity tokens held by session wallets
    for (const addr of session.walletAddresses) {
      try {
        const keypair = getKeypairByAddress(wallets, addr);
        const balances = await getAllTokenBalances(connection, keypair.publicKey, ACTIVITY_TOKENS);

        for (const [mint, balance] of balances) {
          try {
            const sellAmount = Number(balance);
            const quote = await getQuote('jupiter', mint, KNOWN_MINTS.WSOL, sellAmount, dexConfig);
            const result = await executeSwap(quote, keypair, dexConfig);
            if (result.success) {
              sellCount++;
              solRecovered += (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
            }
          } catch {
            // Best-effort sell — skip failures silently
          }
        }
      } catch {
        // Wallet not found or other error — skip
      }
    }

    const { stats } = session;
    const uptimeMs = Date.now() - stats.startedAt.getTime();
    const uptimeMin = (uptimeMs / 60_000).toFixed(1);
    const successRate = stats.tradesExecuted > 0
      ? ((stats.tradesSuccessful / stats.tradesExecuted) * 100).toFixed(1)
      : '0.0';

    lines.push(`Activity session ${session.id} stopped.`);
    lines.push('');
    lines.push('Final stats:');
    lines.push(`  Runtime: ${uptimeMin} minutes`);
    lines.push(`  Transactions: ${stats.tradesExecuted} (${stats.tradesSuccessful} OK / ${stats.tradesFailed} failed)`);
    lines.push(`  Success rate: ${successRate}%`);
    lines.push(`  Volume: ${stats.volumeSol.toFixed(4)} SOL`);
    lines.push(`  Wallets: ${session.walletAddresses.length}`);

    if (sellCount > 0) {
      lines.push('');
      lines.push('Cleanup:');
      lines.push(`  Token positions sold: ${sellCount}`);
      lines.push(`  SOL recovered: ${solRecovered.toFixed(4)} SOL`);
    }

    removeSession(session.id);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
