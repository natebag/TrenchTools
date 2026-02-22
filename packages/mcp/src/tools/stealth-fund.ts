import { z } from 'zod';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js';
import { CHANGENOW_PAIRS } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress, getDefaultWallet } from '../vault.js';
import { getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const USDC_MINT = KNOWN_MINTS.USDC;
const USDC_DECIMALS = 6;

export const toolName = 'trench_stealth_fund';
export const toolDescription =
  'Fund wallets through ChangeNow exchange to break the on-chain link between treasury and bot wallets. Swaps SOL to USDC, sends USDC through ChangeNow (USDC->SOL), which deposits SOL into each target wallet from a third-party address. This is a BLOCKING call that takes 3-10 minutes.';

export const toolSchema = z.object({
  walletAddresses: z.array(z.string()).min(1).max(25).describe('Wallet addresses to fund stealthily'),
  amountSol: z.number().positive().describe('Amount of native token to deliver to each wallet (SOL/BNB/ETH)'),
  chain: z.enum(['solana', 'bsc', 'base']).optional().default('solana').describe('Chain to receive funds on'),
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

interface ChangeNowExchange {
  id: string;
  payinAddress: string;
  expectedAmountTo: number;
  status: string;
}

async function createChangeNowExchange(
  apiKey: string,
  toAddress: string,
  fromAmount: number,
  fromCurrency: string = 'usdcsol',
  toCurrency: string = 'sol',
  toNetwork?: string,
): Promise<ChangeNowExchange> {
  const body: Record<string, string> = {
    fromCurrency,
    toCurrency,
    fromNetwork: 'sol', // USDC always originates from Solana
    fromAmount: fromAmount.toString(),
    address: toAddress,
    flow: 'standard',
  };
  // If a specific destination network is needed (e.g. 'base' for ETH on Base)
  if (toNetwork) {
    body.toNetwork = toNetwork;
  }

  const resp = await fetch('https://api.changenow.io/v2/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-changenow-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ChangeNow API error (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<ChangeNowExchange>;
}

async function pollChangeNowStatus(
  apiKey: string,
  exchangeId: string,
  timeoutMs: number = 600_000, // 10 minutes
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`https://api.changenow.io/v2/exchange/by-id/${exchangeId}`, {
        headers: { 'x-changenow-api-key': apiKey },
      });

      if (resp.ok) {
        const data = await resp.json() as { status: string };
        if (data.status === 'finished') return 'finished';
        if (data.status === 'failed' || data.status === 'refunded') return data.status;
      }
    } catch {
      // Transient error — keep polling
    }

    await new Promise(r => setTimeout(r, 15_000)); // Poll every 15s
  }

  return 'timeout';
}

/**
 * Get USDC balance for a wallet.
 */
async function getUsdcBalance(connection: Connection, owner: PublicKey): Promise<bigint> {
  const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { account } of tokenAccounts.value) {
    const data = account.data;
    const mintBytes = data.subarray(0, 32);
    const mint = new PublicKey(mintBytes).toBase58();
    if (mint === USDC_MINT) {
      return data.subarray(64, 72).readBigUInt64LE(0);
    }
  }
  return 0n;
}

/**
 * Create a SPL token transfer instruction (inline — no @solana/spl-token dependency).
 * Transfers USDC from one ATA to another.
 */
function createTokenTransferInstruction(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
): { keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]; programId: PublicKey; data: Buffer } {
  // SPL Token Transfer instruction: index 3, followed by u64 LE amount
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // Transfer instruction
  data.writeBigUInt64LE(amount, 1);

  return {
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  };
}

/**
 * Derive an Associated Token Address (inline — no @solana/spl-token dependency).
 */
function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ATA_PROGRAM_ID,
  );
  return ata;
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const { walletAddresses, amountSol } = args;
  const chain = args.chain ?? 'solana';
  const cnPair = CHANGENOW_PAIRS[chain];

  // -----------------------------------------------------------------------
  // Path 1: Hosted mode — delegate to hosted API
  // -----------------------------------------------------------------------
  if (config.isHosted && config.apiUrl) {
    try {
      const resp = await fetch(`${config.apiUrl}/api/stealth/fund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({ walletAddresses, amountSol, chain }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return {
          content: [{
            type: 'text' as const,
            text: `Hosted stealth fund failed (${resp.status}): ${text}`,
          }],
        };
      }

      const result = await resp.json() as { message?: string; results?: unknown[] };
      return {
        content: [{
          type: 'text' as const,
          text: `Stealth funding via hosted API:\n${JSON.stringify(result, null, 2)}`,
        }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{
          type: 'text' as const,
          text: `Hosted stealth fund error: ${msg}`,
        }],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Path 2: Self-hosted — direct ChangeNow integration
  // -----------------------------------------------------------------------
  const changeNowApiKey = process.env.TRENCH_CHANGENOW_API_KEY;
  if (!changeNowApiKey) {
    return {
      content: [{
        type: 'text' as const,
        text: 'TRENCH_CHANGENOW_API_KEY environment variable is required for self-hosted stealth funding. Set it in your MCP server env config, or use hosted mode (TRENCH_API_URL) which handles this server-side.',
      }],
    };
  }

  // Get treasury wallet
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
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const dexConfig = getDexConfig(config);

  const walletCount = walletAddresses.length;
  // Estimate: amountSol per wallet + buffer for exchange fees (~5%)
  const totalSolNeeded = amountSol * walletCount * 1.05;
  const totalLamports = Math.round(totalSolNeeded * LAMPORTS_PER_SOL);

  // Check treasury SOL balance
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  if (treasuryBalance < totalLamports + 0.02 * LAMPORTS_PER_SOL) {
    return {
      content: [{
        type: 'text' as const,
        text: `Insufficient treasury balance. Need ~${totalSolNeeded.toFixed(4)} SOL, have ${(treasuryBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
      }],
    };
  }

  const lines: string[] = [];
  lines.push('Stealth funding initiated...');
  lines.push(`  Wallets: ${walletCount}`);
  lines.push(`  SOL per wallet: ${amountSol}`);
  lines.push(`  Total SOL (est.): ~${totalSolNeeded.toFixed(4)} SOL`);
  lines.push('');

  // Step 1: Swap SOL -> USDC via Jupiter
  lines.push('Step 1: Swapping SOL to USDC...');
  let usdcAmount: number;
  try {
    const quote = await getQuote(
      'jupiter',
      KNOWN_MINTS.WSOL,
      USDC_MINT,
      totalLamports,
      dexConfig,
    );
    const result = await executeSwap(quote, treasuryKeypair, dexConfig);
    if (!result.success) {
      return {
        content: [{
          type: 'text' as const,
          text: `SOL -> USDC swap failed: ${result.error}`,
        }],
      };
    }
    usdcAmount = result.outputAmount ?? quote.outputAmount;
    const usdcHuman = usdcAmount / 10 ** USDC_DECIMALS;
    lines.push(`  Received: ${usdcHuman.toFixed(2)} USDC`);
    lines.push('');

    // Wait for swap to settle
    await new Promise(r => setTimeout(r, 3000));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `SOL -> USDC swap error: ${msg}`,
      }],
    };
  }

  // Step 2: For each wallet, create ChangeNow exchange and send USDC deposit
  lines.push('Step 2: Creating ChangeNow exchanges and sending USDC deposits...');
  const usdcPerWallet = Math.floor(usdcAmount / walletCount);
  const usdcPerWalletHuman = usdcPerWallet / 10 ** USDC_DECIMALS;

  const exchanges: { address: string; exchangeId: string; payinAddress: string; status: string }[] = [];

  const treasuryAta = getAssociatedTokenAddress(treasuryKeypair.publicKey, new PublicKey(USDC_MINT));

  for (const addr of walletAddresses) {
    const truncated = addr.slice(0, 4) + '...' + addr.slice(-4);
    try {
      // Create ChangeNow exchange: USDC -> native token on target chain
      const exchange = await createChangeNowExchange(
        changeNowApiKey,
        addr,
        usdcPerWalletHuman,
        cnPair.from,
        cnPair.to,
        cnPair.network,
      );

      lines.push(`  ${truncated}: exchange ${exchange.id} created, deposit to ${exchange.payinAddress.slice(0, 8)}...`);

      // Send USDC to the ChangeNow deposit address
      const depositAta = getAssociatedTokenAddress(
        new PublicKey(exchange.payinAddress),
        new PublicKey(USDC_MINT),
      );

      const transferIx = createTokenTransferInstruction(
        treasuryAta,
        depositAta,
        treasuryKeypair.publicKey,
        BigInt(usdcPerWallet),
      );

      const tx = new Transaction().add(transferIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = treasuryKeypair.publicKey;
      tx.sign(treasuryKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Poll for USDC transfer confirmation
      let confirmed = false;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statusResp = await connection.getSignatureStatuses([signature]);
        const status = statusResp.value[0];
        if (status) {
          if (status.err) throw new Error(`USDC transfer failed: ${JSON.stringify(status.err)}`);
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      }

      if (!confirmed) throw new Error('USDC transfer not confirmed after 20s');

      lines.push(`  ${truncated}: USDC deposit sent (${signature.slice(0, 12)}...)`);
      exchanges.push({ address: addr, exchangeId: exchange.id, payinAddress: exchange.payinAddress, status: 'deposited' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      lines.push(`  ${truncated}: FAILED - ${msg}`);
      exchanges.push({ address: addr, exchangeId: '', payinAddress: '', status: `failed: ${msg}` });
    }
  }

  lines.push('');

  // Step 3: Poll all exchanges until finished or failed
  lines.push('Step 3: Waiting for ChangeNow exchanges to complete (this may take 5-10 minutes)...');
  const results: { address: string; status: string }[] = [];

  for (const ex of exchanges) {
    if (!ex.exchangeId) {
      results.push({ address: ex.address, status: ex.status });
      continue;
    }

    const finalStatus = await pollChangeNowStatus(changeNowApiKey, ex.exchangeId);
    const truncated = ex.address.slice(0, 4) + '...' + ex.address.slice(-4);
    results.push({ address: ex.address, status: finalStatus });
    lines.push(`  ${truncated}: ${finalStatus}`);
  }

  lines.push('');

  // Step 4: Swap any leftover USDC back to SOL
  try {
    const leftoverUsdc = await getUsdcBalance(connection, treasuryKeypair.publicKey);
    if (leftoverUsdc > 100_000n) { // > 0.1 USDC
      lines.push('Step 4: Swapping leftover USDC back to SOL...');
      const quote = await getQuote(
        'jupiter',
        USDC_MINT,
        KNOWN_MINTS.WSOL,
        Number(leftoverUsdc),
        dexConfig,
      );
      const result = await executeSwap(quote, treasuryKeypair, dexConfig);
      if (result.success) {
        const solBack = (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
        lines.push(`  Recovered: ${solBack.toFixed(4)} SOL`);
      } else {
        lines.push(`  USDC -> SOL swap failed: ${result.error}`);
      }
    }
  } catch {
    lines.push('  Note: could not swap leftover USDC back to SOL');
  }

  lines.push('');

  // Summary
  const succeeded = results.filter(r => r.status === 'finished').length;
  const failed = results.filter(r => r.status !== 'finished').length;
  lines.push('Summary:');
  lines.push(`  Succeeded: ${succeeded}/${walletCount}`);
  if (failed > 0) lines.push(`  Failed/Timeout: ${failed}`);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
