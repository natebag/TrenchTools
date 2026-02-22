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
  removeWallets,
} from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { getLaunchWalletAddresses, getLaunchesForWallet } from '../lib/pumpfun-launch.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';
import { getSessionsByType, stopSession, removeSession } from '../lib/sessions.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_bot_stop';
export const toolDescription =
  'Stop a bot group by name. Sells all held tokens, sweeps SOL back to treasury, and removes bot wallets from the vault.';

export const toolSchema = z.object({
  name: z.string().describe('Bot group name to stop'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function getDexConfig(config: MCPConfig): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps: config.slippageBps,
    heliusApiKey: config.heliusApiKey,
  };
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

export async function handler(args: ToolInput, config: MCPConfig) {
  const { name } = args;

  // Find bot session by name
  const sessions = getSessionsByType('bot');
  const session = sessions.find(s => s.botName === name);
  if (!session) {
    return {
      content: [{
        type: 'text' as const,
        text: `No bot group found with name "${name}". Use trench_bot_status to see active groups.`,
      }],
    };
  }

  // 1. Stop trade loops
  stopSession(session.id);

  const wallets = await ensureUnlocked(config);
  const treasury = getDefaultWallet(wallets);
  const treasuryPubkey = new PublicKey(treasury.publicKey);
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const dexConfig = getDexConfig(config);

  let tokensSold = 0;
  let solRecovered = 0;
  const details: string[] = [];

  // 2. For each bot wallet: sell all tokens, then sweep SOL
  for (const addr of session.walletAddresses) {
    try {
      const keypair = getKeypairByAddress(wallets, addr);
      const truncated = addr.slice(0, 4) + '...' + addr.slice(-4);

      // Sell tokens if any
      const tokenBalance = await getTokenBalance(connection, keypair.publicKey, session.tokenMint);
      if (tokenBalance > 0n) {
        try {
          const dexType = await detectDex(session.tokenMint, config.rpcUrl);
          const sellAmount = Number(tokenBalance);
          const quote = await getQuote(dexType, session.tokenMint, KNOWN_MINTS.WSOL, sellAmount, dexConfig);
          const result = await executeSwap(quote, keypair, dexConfig);
          if (result.success) {
            const solReceived = (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
            tokensSold++;
            details.push(`  ${truncated}: sold tokens for ~${solReceived.toFixed(4)} SOL`);
            // Wait a moment for the sell tx to settle
            await new Promise(r => setTimeout(r, 2000));
          } else {
            details.push(`  ${truncated}: sell failed - ${result.error}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          details.push(`  ${truncated}: sell error - ${msg}`);
        }
      }

      // Sweep SOL back to treasury
      const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
      const rentReserve = 0.002 * LAMPORTS_PER_SOL;
      const txFee = 5000;
      const sendAmount = solBalance - rentReserve - txFee;

      if (sendAmount > 0) {
        try {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: treasuryPubkey,
              lamports: sendAmount,
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
          for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 2500));
            const statusResp = await connection.getSignatureStatuses([signature]);
            const status = statusResp.value[0];
            if (status) {
              if (status.err) throw new Error(`Sweep tx failed: ${JSON.stringify(status.err)}`);
              if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                confirmed = true;
                break;
              }
            }
          }

          if (confirmed) {
            const sweptSol = sendAmount / LAMPORTS_PER_SOL;
            solRecovered += sweptSol;
            details.push(`  ${truncated}: swept ${sweptSol.toFixed(4)} SOL to treasury`);
          } else {
            details.push(`  ${truncated}: sweep not confirmed after 20s`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          details.push(`  ${truncated}: sweep error - ${msg}`);
        }
      } else {
        details.push(`  ${truncated}: balance too low to sweep`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      details.push(`  ${addr.slice(0, 4)}...${addr.slice(-4)}: error - ${msg}`);
    }
  }

  // 3. Protect launch wallets from deletion (creator fees would be lost forever)
  const launchAddresses = await getLaunchWalletAddresses();
  const protectedAddrs: string[] = [];
  const deletableAddrs: string[] = [];
  for (const addr of session.walletAddresses) {
    if (launchAddresses.has(addr)) {
      protectedAddrs.push(addr);
    } else {
      deletableAddrs.push(addr);
    }
  }

  if (protectedAddrs.length > 0) {
    details.push('');
    details.push('  ⚠ Launch wallets PROTECTED from deletion (creator fees):');
    for (const addr of protectedAddrs) {
      const truncated = addr.slice(0, 4) + '...' + addr.slice(-4);
      const launches = await getLaunchesForWallet(addr);
      const tokens = launches.map(l => `${l.name} ($${l.symbol})`).join(', ');
      details.push(`    ${truncated}: ${tokens}`);
    }
  }

  // Remove only non-launch bot wallets from vault
  try {
    if (deletableAddrs.length > 0) {
      await removeWallets(config, deletableAddrs);
    }
  } catch {
    details.push('  Warning: failed to remove bot wallets from vault');
  }

  // 4. Remove session
  const { stats } = session;
  removeSession(session.id);

  const lines: string[] = [];
  lines.push(`Bot group "${name}" stopped and cleaned up.`);
  lines.push('');
  lines.push('Summary:');
  lines.push(`  Tokens sold from: ${tokensSold} wallet(s)`);
  lines.push(`  SOL recovered: ${solRecovered.toFixed(4)} SOL`);
  lines.push(`  Total trades executed: ${stats.tradesExecuted}`);
  lines.push(`  Total volume: ${stats.volumeSol.toFixed(4)} SOL`);
  lines.push(`  Bot wallets removed: ${deletableAddrs.length}`);
  if (protectedAddrs.length > 0) {
    lines.push(`  Launch wallets protected: ${protectedAddrs.length} (creator fees preserved)`);
  }
  lines.push('');
  lines.push('Details:');
  lines.push(...details);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
