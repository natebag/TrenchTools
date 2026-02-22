import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress } from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig, DexType } from '../lib/dex/types.js';
import { createSession, getSessionsByType } from '../lib/sessions.js';
import type { Session } from '../lib/sessions.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_volume_start';
export const toolDescription =
  'Start volume boosting on a token. Runs random buy/sell swaps across vault wallets in parallel loops. Only one volume session can run at a time.';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address to generate volume for'),
  maxWallets: z.number().int().min(1).max(25).optional().default(3).describe('Number of vault wallets to use (default 3)'),
  minSwapSol: z.number().positive().optional().default(0.01).describe('Min SOL per swap (default 0.01)'),
  maxSwapSol: z.number().positive().optional().default(0.05).describe('Max SOL per swap (default 0.05)'),
  minIntervalMs: z.number().int().min(5000).optional().default(30000).describe('Min delay between swaps in ms (default 30000)'),
  maxIntervalMs: z.number().int().min(10000).optional().default(120000).describe('Max delay between swaps in ms (default 120000)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function getDexConfig(config: MCPConfig, slippageOverride?: number): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps: slippageOverride ?? config.slippageBps,
    heliusApiKey: config.heliusApiKey,
  };
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  tokenMint: string,
): Promise<bigint> {
  const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { account } of tokenAccounts.value) {
    const data = account.data;
    const mintBytes = data.subarray(0, 32);
    const mint = new PublicKey(mintBytes).toBase58();
    if (mint === tokenMint) {
      const amountBuf = data.subarray(64, 72);
      return amountBuf.readBigUInt64LE(0);
    }
  }
  return 0n;
}

/**
 * Recursive trade loop for a single wallet.
 * Schedules itself via setTimeout so the session's timer array can cancel it.
 */
function startTradeLoop(
  session: Session,
  walletAddress: string,
  config: MCPConfig,
  opts: {
    tokenMint: string;
    minSwapSol: number;
    maxSwapSol: number;
    minIntervalMs: number;
    maxIntervalMs: number;
  },
): void {
  if (!session.running) return;

  const delay = Math.round(randomBetween(opts.minIntervalMs, opts.maxIntervalMs));
  const timer = setTimeout(async () => {
    if (!session.running) return;

    try {
      const wallets = await ensureUnlocked(config);
      const keypair = getKeypairByAddress(wallets, walletAddress);
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const dexType: DexType = await detectDex(opts.tokenMint, config.rpcUrl);
      const dexConfig = getDexConfig(config);

      // Check if wallet holds the token
      const tokenBalance = await getTokenBalance(
        connection,
        keypair.publicKey,
        opts.tokenMint,
      );

      const hasTokens = tokenBalance > 0n;
      // 50% chance to sell if we have tokens, otherwise buy
      const shouldSell = hasTokens && Math.random() < 0.5;

      if (shouldSell) {
        // Sell all tokens
        const sellAmount = Number(tokenBalance);
        const quote = await getQuote(
          dexType,
          opts.tokenMint,
          KNOWN_MINTS.WSOL,
          sellAmount,
          dexConfig,
        );
        const result = await executeSwap(quote, keypair, dexConfig);

        session.stats.tradesExecuted++;
        if (result.success) {
          session.stats.tradesSuccessful++;
          const solReceived = (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
          session.stats.volumeSol += solReceived;
        } else {
          session.stats.tradesFailed++;
        }
      } else {
        // Buy with random SOL amount
        const solAmount = randomBetween(opts.minSwapSol, opts.maxSwapSol);
        const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

        // Check SOL balance first — keep 0.01 SOL reserve
        const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
        const reserveLamports = 0.01 * LAMPORTS_PER_SOL;
        if (solBalance < lamports + reserveLamports) {
          // Not enough SOL, skip this round
          session.stats.tradesFailed++;
          session.stats.tradesExecuted++;
        } else {
          const quote = await getQuote(
            dexType,
            KNOWN_MINTS.WSOL,
            opts.tokenMint,
            lamports,
            dexConfig,
          );
          const result = await executeSwap(quote, keypair, dexConfig);

          session.stats.tradesExecuted++;
          if (result.success) {
            session.stats.tradesSuccessful++;
            session.stats.volumeSol += solAmount;
          } else {
            session.stats.tradesFailed++;
          }
        }
      }
    } catch {
      session.stats.tradesExecuted++;
      session.stats.tradesFailed++;
    }

    // Schedule next trade
    startTradeLoop(session, walletAddress, config, opts);
  }, delay);

  session.timers.push(timer);
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const {
    tokenMint,
    maxWallets = 3,
    minSwapSol = 0.01,
    maxSwapSol = 0.05,
    minIntervalMs = 30000,
    maxIntervalMs = 120000,
  } = args;

  // Check no volume session already running
  const existing = getSessionsByType('volume').filter(s => s.running);
  if (existing.length > 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `A volume session is already running (${existing[0].id}). Stop it first with trench_volume_stop.`,
      }],
    };
  }

  // Get wallets
  const wallets = await ensureUnlocked(config);
  if (wallets.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No wallets in vault. Use trench_wallet_generate to create wallets first.',
      }],
    };
  }

  const walletsToUse = wallets.slice(0, maxWallets);
  const addresses = walletsToUse.map(w => w.publicKey);

  // Create session
  const session = createSession('volume', tokenMint, addresses);

  // Start trade loops
  for (const addr of addresses) {
    startTradeLoop(session, addr, config, {
      tokenMint,
      minSwapSol,
      maxSwapSol,
      minIntervalMs,
      maxIntervalMs,
    });
  }

  const lines: string[] = [];
  lines.push('Volume boosting started');
  lines.push('');
  lines.push(`  Session: ${session.id}`);
  lines.push(`  Token: ${tokenMint}`);
  lines.push(`  Wallets: ${addresses.length}`);
  lines.push(`  Swap range: ${minSwapSol}-${maxSwapSol} SOL`);
  lines.push(`  Interval: ${(minIntervalMs / 1000).toFixed(0)}s - ${(maxIntervalMs / 1000).toFixed(0)}s`);
  lines.push('');
  lines.push('Use trench_volume_status to check progress, trench_volume_stop to stop.');

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
