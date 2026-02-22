import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress, getDefaultWallet } from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';
import { collectFee } from '../lib/fees.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_sell';
export const toolDescription = 'Sell a token for SOL. If amountTokens is omitted, sells the entire token balance. Auto-routes between PumpFun and Jupiter.';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address to sell'),
  amountTokens: z.number().positive().optional().describe('Raw token amount to sell (smallest unit). Omit to sell entire balance.'),
  walletAddress: z.string().optional().describe('Wallet to sell from. Omit to use default vault wallet.'),
  slippageBps: z.number().int().min(1).max(5000).optional().describe('Slippage tolerance in basis points (default: from config)'),
  chain: z.enum(['solana', 'bsc', 'base']).optional().default('solana').describe('Blockchain to trade on'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function getDexConfig(config: MCPConfig, slippageOverride?: number): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps: slippageOverride ?? config.slippageBps,
    heliusApiKey: config.heliusApiKey,
    hostedApiUrl: config.apiUrl,
    hostedApiKey: config.apiKey,
    feeAccount: config.feeAccount,
    feeBps: config.feeBps,
  };
}

async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  tokenMint: string
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

export async function handler(args: ToolInput, config: MCPConfig) {
  const { tokenMint, slippageBps } = args;

  // Multi-chain guard — EVM trading not yet wired
  const chain = args.chain ?? 'solana';
  if (chain !== 'solana') {
    return {
      content: [{ type: 'text' as const, text: `EVM trading on ${chain} coming soon. Use Solana for now.` }],
    };
  }

  // Get wallet
  const wallets = await ensureUnlocked(config);
  let walletAddress: string;
  if (args.walletAddress) {
    walletAddress = args.walletAddress;
  } else {
    const defaultWallet = getDefaultWallet(wallets);
    walletAddress = defaultWallet.publicKey;
  }
  const keypair = getKeypairByAddress(wallets, walletAddress);

  // Determine amount to sell
  let sellAmount: number;
  if (args.amountTokens) {
    sellAmount = Math.round(args.amountTokens);
  } else {
    // Fetch full token balance
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const balance = await getTokenBalance(
      connection,
      keypair.publicKey,
      tokenMint
    );

    if (balance === 0n) {
      return {
        content: [{
          type: 'text' as const,
          text: `No balance found for token ${tokenMint} in wallet ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
        }],
      };
    }

    sellAmount = Number(balance);
  }

  // Detect DEX
  const dexType = await detectDex(tokenMint, config.rpcUrl);
  const dexConfig = getDexConfig(config, slippageBps);

  try {
    // Get quote: Token -> SOL
    const quote = await getQuote(
      dexType,
      tokenMint,
      KNOWN_MINTS.WSOL,
      sellAmount,
      dexConfig
    );

    // Execute swap
    const result = await executeSwap(quote, keypair, dexConfig);

    if (!result.success) {
      return {
        content: [{
          type: 'text' as const,
          text: `Sell failed: ${result.error}\n\nWallet: ${result.wallet}\nDEX: ${dexType}`,
        }],
      };
    }

    const inputTokens = sellAmount / 1_000_000;
    const outputSol = (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;

    // Collect fee in hosted mode on the SOL received (post-swap SOL transfer)
    let feeTx: string | null = null;
    if (config.feeAccount && config.feeBps) {
      try {
        const connection = new Connection(config.rpcUrl, 'confirmed');
        feeTx = await collectFee(connection, keypair, outputSol, config.feeAccount, config.feeBps);
      } catch { /* fee failure should not fail the trade */ }
    }

    const lines: string[] = [];
    lines.push(`Sell successful via ${dexType === 'pumpfun' ? 'PumpFun' : 'Jupiter'}`);
    lines.push('');
    lines.push(`  Sold: ${inputTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`);
    lines.push(`  Received: ~${outputSol.toFixed(4)} SOL`);
    lines.push(`  Wallet: ${result.wallet}`);
    lines.push(`  Tx: ${result.txHash}`);
    lines.push(`  Solscan: https://solscan.io/tx/${result.txHash}`);
    if (feeTx) {
      lines.push(`  Fee tx: ${feeTx}`);
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Sell failed (${dexType}): ${message}`,
      }],
    };
  }
}
