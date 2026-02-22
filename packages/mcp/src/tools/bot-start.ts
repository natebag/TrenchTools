import { z } from 'zod';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import {
  ensureUnlocked,
  getKeypairByAddress,
  getDefaultWallet,
  generateAndAddWallets,
} from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig, DexType } from '../lib/dex/types.js';
import { createSession, getSessionsByType } from '../lib/sessions.js';
import type { Session } from '../lib/sessions.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const MAX_BOT_GROUPS = 6;

export const toolName = 'trench_bot_start';
export const toolDescription =
  'Start a named bot group for a token. Generates fresh wallets, funds them from treasury, and starts parallel trade loops. Max 6 bot groups at once.';

export const toolSchema = z.object({
  name: z.string().min(1).max(20).describe('Bot group name (e.g. "alpha")'),
  tokenMint: z.string().describe('Token mint to trade'),
  walletCount: z.number().int().min(1).max(25).default(5).describe('Number of bot wallets to generate (default 5)'),
  solPerWallet: z.number().positive().default(0.05).describe('SOL to fund each wallet (default 0.05)'),
  intensity: z.enum(['low', 'medium', 'high']).optional().default('medium').describe('Trade intensity preset (default medium)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

const INTENSITY_PRESETS = {
  low:    { minSwapSol: 0.005, maxSwapSol: 0.02,  minIntervalMs: 60_000,  maxIntervalMs: 300_000 },
  medium: { minSwapSol: 0.01,  maxSwapSol: 0.05,  minIntervalMs: 30_000,  maxIntervalMs: 120_000 },
  high:   { minSwapSol: 0.02,  maxSwapSol: 0.1,   minIntervalMs: 15_000,  maxIntervalMs: 60_000  },
} as const;

function getDexConfig(config: MCPConfig): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps: config.slippageBps,
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
      return data.subarray(64, 72).readBigUInt64LE(0);
    }
  }
  return 0n;
}

/**
 * Recursive trade loop for a single bot wallet (same pattern as volume-start).
 */
function startTradeLoop(
  session: Session,
  walletAddress: string,
  config: MCPConfig,
  opts: { tokenMint: string; minSwapSol: number; maxSwapSol: number; minIntervalMs: number; maxIntervalMs: number },
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

      const tokenBalance = await getTokenBalance(connection, keypair.publicKey, opts.tokenMint);
      const hasTokens = tokenBalance > 0n;
      const shouldSell = hasTokens && Math.random() < 0.5;

      if (shouldSell) {
        const sellAmount = Number(tokenBalance);
        const quote = await getQuote(dexType, opts.tokenMint, KNOWN_MINTS.WSOL, sellAmount, dexConfig);
        const result = await executeSwap(quote, keypair, dexConfig);
        session.stats.tradesExecuted++;
        if (result.success) {
          session.stats.tradesSuccessful++;
          session.stats.volumeSol += (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
        } else {
          session.stats.tradesFailed++;
        }
      } else {
        const solAmount = randomBetween(opts.minSwapSol, opts.maxSwapSol);
        const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
        const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
        const reserveLamports = 0.01 * LAMPORTS_PER_SOL;

        if (solBalance < lamports + reserveLamports) {
          session.stats.tradesExecuted++;
          session.stats.tradesFailed++;
        } else {
          const quote = await getQuote(dexType, KNOWN_MINTS.WSOL, opts.tokenMint, lamports, dexConfig);
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

    startTradeLoop(session, walletAddress, config, opts);
  }, delay);

  session.timers.push(timer);
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const {
    name,
    tokenMint,
    walletCount = 5,
    solPerWallet = 0.05,
    intensity = 'medium',
  } = args;

  // Check max bot groups
  const existingBots = getSessionsByType('bot').filter(s => s.running);
  if (existingBots.length >= MAX_BOT_GROUPS) {
    return {
      content: [{
        type: 'text' as const,
        text: `Maximum ${MAX_BOT_GROUPS} bot groups reached. Stop an existing group first with trench_bot_stop.`,
      }],
    };
  }

  // Check duplicate name
  const duplicate = existingBots.find(s => s.botName === name);
  if (duplicate) {
    return {
      content: [{
        type: 'text' as const,
        text: `Bot group "${name}" already exists and is running. Choose a different name or stop it first.`,
      }],
    };
  }

  // Get treasury wallet (first vault wallet)
  const wallets = await ensureUnlocked(config);
  if (wallets.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No wallets in vault. Use trench_wallet_generate to create a treasury wallet first.',
      }],
    };
  }
  const treasury = getDefaultWallet(wallets);
  const treasuryKeypair = getKeypairByAddress(wallets, treasury.publicKey);

  // Generate fresh bot wallets
  const newWallets = await generateAndAddWallets(config, walletCount);
  const botAddresses = newWallets.map(w => w.publicKey);

  // Fund each bot wallet from treasury
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const lamportsPerWallet = Math.round(solPerWallet * LAMPORTS_PER_SOL);
  const totalNeeded = lamportsPerWallet * walletCount;

  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  const feeReserve = 5000 * walletCount + 0.01 * LAMPORTS_PER_SOL; // tx fees + rent reserve
  if (treasuryBalance < totalNeeded + feeReserve) {
    return {
      content: [{
        type: 'text' as const,
        text: `Insufficient treasury balance. Need ~${((totalNeeded + feeReserve) / LAMPORTS_PER_SOL).toFixed(4)} SOL, have ${(treasuryBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
      }],
    };
  }

  let fundedCount = 0;
  const fundResults: string[] = [];

  for (const addr of botAddresses) {
    try {
      const toPubkey = new PublicKey(addr);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasuryKeypair.publicKey,
          toPubkey,
          lamports: lamportsPerWallet,
        }),
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = treasuryKeypair.publicKey;
      tx.sign(treasuryKeypair);

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
          if (status.err) throw new Error(`Tx failed: ${JSON.stringify(status.err)}`);
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      }

      if (!confirmed) throw new Error('Funding tx not confirmed after 20s');
      fundedCount++;
      fundResults.push(`  ${addr.slice(0, 4)}...${addr.slice(-4)}: funded ${solPerWallet} SOL`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      fundResults.push(`  ${addr.slice(0, 4)}...${addr.slice(-4)}: FAILED - ${msg}`);
    }
  }

  // Create session and start trade loops
  const preset = INTENSITY_PRESETS[intensity];
  const session = createSession('bot', tokenMint, botAddresses, { botName: name });

  for (const addr of botAddresses) {
    startTradeLoop(session, addr, config, {
      tokenMint,
      ...preset,
    });
  }

  const lines: string[] = [];
  lines.push(`Bot group "${name}" started`);
  lines.push('');
  lines.push(`  Session: ${session.id}`);
  lines.push(`  Token: ${tokenMint}`);
  lines.push(`  Intensity: ${intensity}`);
  lines.push(`  Wallets: ${walletCount} (${fundedCount} funded)`);
  lines.push(`  SOL per wallet: ${solPerWallet}`);
  lines.push(`  Total funded: ${(fundedCount * solPerWallet).toFixed(4)} SOL`);
  lines.push('');
  lines.push('Funding details:');
  lines.push(...fundResults);
  lines.push('');
  lines.push('Use trench_bot_status to check progress, trench_bot_stop to stop and recover funds.');

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
