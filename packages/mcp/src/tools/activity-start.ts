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
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';
import { createSession, getSessionsByType } from '../lib/sessions.js';
import type { Session } from '../lib/sessions.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Popular tokens used for generating realistic wallet activity.
 */
const ACTIVITY_TOKENS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   // JUP
];

export const toolName = 'trench_activity_start';
export const toolDescription =
  'Start generating wallet activity (random swaps and transfers) for a set duration. Makes wallets look organic with diverse transaction history.';

export const toolSchema = z.object({
  durationHours: z.number().positive().min(0.5).max(48).default(1).describe('How long to run in hours (default 1, max 48)'),
  walletAddresses: z.array(z.string()).optional().describe('Specific wallets to use. Omit to use all vault wallets.'),
  intensity: z.enum(['low', 'medium', 'high']).optional().default('medium').describe('Activity intensity (default medium)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

const INTENSITY_PRESETS = {
  low:    { minSwapSol: 0.002, maxSwapSol: 0.01,  minIntervalMs: 120_000, maxIntervalMs: 600_000,  transferChance: 0.3 },
  medium: { minSwapSol: 0.005, maxSwapSol: 0.02,  minIntervalMs: 60_000,  maxIntervalMs: 300_000,  transferChance: 0.4 },
  high:   { minSwapSol: 0.01,  maxSwapSol: 0.05,  minIntervalMs: 30_000,  maxIntervalMs: 120_000,  transferChance: 0.5 },
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
 * Recursive activity loop for a single wallet.
 * Performs random token swaps and small SOL transfers to peers.
 */
function startActivityLoop(
  session: Session,
  walletAddress: string,
  allAddresses: string[],
  config: MCPConfig,
  opts: {
    minSwapSol: number;
    maxSwapSol: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    transferChance: number;
  },
): void {
  if (!session.running) return;

  const delay = Math.round(randomBetween(opts.minIntervalMs, opts.maxIntervalMs));
  const timer = setTimeout(async () => {
    if (!session.running) return;

    // Check if duration expired
    if (session.endTime && Date.now() >= session.endTime.getTime()) {
      session.running = false;
      for (const t of session.timers) clearTimeout(t);
      session.timers = [];
      return;
    }

    try {
      const wallets = await ensureUnlocked(config);
      const keypair = getKeypairByAddress(wallets, walletAddress);
      const connection = new Connection(config.rpcUrl, 'confirmed');

      // Decide: SOL transfer to peer, or token swap
      const doTransfer = allAddresses.length > 1 && Math.random() < opts.transferChance;

      if (doTransfer) {
        // Small SOL transfer to a random peer wallet
        const peers = allAddresses.filter(a => a !== walletAddress);
        const peer = pickRandom(peers);
        const transferSol = randomBetween(0.001, 0.005);
        const transferLamports = Math.round(transferSol * LAMPORTS_PER_SOL);

        const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
        const reserve = 0.01 * LAMPORTS_PER_SOL;
        if (solBalance < transferLamports + reserve + 5000) {
          session.stats.tradesExecuted++;
          session.stats.tradesFailed++;
        } else {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: new PublicKey(peer),
              lamports: transferLamports,
            }),
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
          for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2500));
            const statusResp = await connection.getSignatureStatuses([signature]);
            const status = statusResp.value[0];
            if (status) {
              if (status.err) throw new Error('Transfer failed on-chain');
              if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                confirmed = true;
                break;
              }
            }
          }

          session.stats.tradesExecuted++;
          if (confirmed) {
            session.stats.tradesSuccessful++;
            session.stats.volumeSol += transferSol;
          } else {
            session.stats.tradesFailed++;
          }
        }
      } else {
        // Random token swap: pick a popular token, buy or sell
        const tokenMint = pickRandom(ACTIVITY_TOKENS);
        const dexConfig = getDexConfig(config);

        // Check if we hold any of this token
        const tokenBalance = await getTokenBalance(connection, keypair.publicKey, tokenMint);
        const hasTokens = tokenBalance > 0n;
        const shouldSell = hasTokens && Math.random() < 0.5;

        if (shouldSell) {
          const sellAmount = Number(tokenBalance);
          try {
            // Activity tokens are on Jupiter (graduated)
            const quote = await getQuote('jupiter', tokenMint, KNOWN_MINTS.WSOL, sellAmount, dexConfig);
            const result = await executeSwap(quote, keypair, dexConfig);
            session.stats.tradesExecuted++;
            if (result.success) {
              session.stats.tradesSuccessful++;
              session.stats.volumeSol += (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
            } else {
              session.stats.tradesFailed++;
            }
          } catch {
            session.stats.tradesExecuted++;
            session.stats.tradesFailed++;
          }
        } else {
          const solAmount = randomBetween(opts.minSwapSol, opts.maxSwapSol);
          const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);

          const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
          const reserve = 0.01 * LAMPORTS_PER_SOL;
          if (solBalance < lamports + reserve) {
            session.stats.tradesExecuted++;
            session.stats.tradesFailed++;
          } else {
            try {
              const quote = await getQuote('jupiter', KNOWN_MINTS.WSOL, tokenMint, lamports, dexConfig);
              const result = await executeSwap(quote, keypair, dexConfig);
              session.stats.tradesExecuted++;
              if (result.success) {
                session.stats.tradesSuccessful++;
                session.stats.volumeSol += solAmount;
              } else {
                session.stats.tradesFailed++;
              }
            } catch {
              session.stats.tradesExecuted++;
              session.stats.tradesFailed++;
            }
          }
        }
      }
    } catch {
      session.stats.tradesExecuted++;
      session.stats.tradesFailed++;
    }

    // Schedule next activity
    startActivityLoop(session, walletAddress, allAddresses, config, opts);
  }, delay);

  session.timers.push(timer);
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const {
    durationHours = 1,
    intensity = 'medium',
  } = args;

  // Check no activity session already running
  const existing = getSessionsByType('activity').filter(s => s.running);
  if (existing.length > 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `An activity session is already running (${existing[0].id}). Stop it first with trench_activity_stop.`,
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

  let addresses: string[];
  if (args.walletAddresses && args.walletAddresses.length > 0) {
    // Validate all requested addresses exist in vault
    const vaultAddrs = new Set(wallets.map(w => w.publicKey));
    for (const addr of args.walletAddresses) {
      if (!vaultAddrs.has(addr)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Wallet ${addr} not found in vault.`,
          }],
        };
      }
    }
    addresses = args.walletAddresses;
  } else {
    addresses = wallets.map(w => w.publicKey);
  }

  const endTime = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  const preset = INTENSITY_PRESETS[intensity];

  // tokenMint is not specific for activity — use 'activity' as placeholder
  const session = createSession('activity', 'activity-mixed', addresses, {
    durationHours,
    endTime,
  });

  for (const addr of addresses) {
    startActivityLoop(session, addr, addresses, config, preset);
  }

  const lines: string[] = [];
  lines.push('Activity generation started');
  lines.push('');
  lines.push(`  Session: ${session.id}`);
  lines.push(`  Duration: ${durationHours}h (ends at ${endTime.toISOString()})`);
  lines.push(`  Intensity: ${intensity}`);
  lines.push(`  Wallets: ${addresses.length}`);
  lines.push(`  Interval: ${(preset.minIntervalMs / 1000).toFixed(0)}s - ${(preset.maxIntervalMs / 1000).toFixed(0)}s`);
  lines.push(`  Transfer chance: ${(preset.transferChance * 100).toFixed(0)}%`);
  lines.push(`  Activity tokens: USDC, BONK, JUP`);
  lines.push('');
  lines.push('Use trench_activity_status to check progress, trench_activity_stop to stop early.');

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
