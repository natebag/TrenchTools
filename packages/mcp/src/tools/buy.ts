import { z } from 'zod';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress, getDefaultWallet } from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';
import { collectFee } from '../lib/fees.js';

export const toolName = 'trench_buy';
export const toolDescription = 'Buy a token with SOL. Auto-routes between PumpFun and Jupiter. Enforces a safety cap (maxBuySol from config).';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address to buy'),
  amountSol: z.number().positive().describe('Amount of SOL to spend'),
  walletAddress: z.string().optional().describe('Wallet to buy from. Omit to use default vault wallet.'),
  slippageBps: z.number().int().min(1).max(5000).optional().describe('Slippage tolerance in basis points (default: from config)'),
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

export async function handler(args: ToolInput, config: MCPConfig) {
  const { tokenMint, amountSol, slippageBps } = args;

  // Safety cap
  if (amountSol > config.maxBuySol) {
    return {
      content: [{
        type: 'text' as const,
        text: `Safety cap: amountSol (${amountSol}) exceeds maxBuySol (${config.maxBuySol} SOL). Increase TRENCH_MAX_BUY_SOL env var if intentional.`,
      }],
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

  // Detect DEX
  const dexType = await detectDex(tokenMint, config.rpcUrl);
  const dexConfig = getDexConfig(config, slippageBps);

  // Get quote: SOL -> Token
  const amountLamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  try {
    const quote = await getQuote(
      dexType,
      KNOWN_MINTS.WSOL,
      tokenMint,
      amountLamports,
      dexConfig
    );

    // Execute swap
    const result = await executeSwap(quote, keypair, dexConfig);

    if (!result.success) {
      return {
        content: [{
          type: 'text' as const,
          text: `Buy failed: ${result.error}\n\nWallet: ${result.wallet}\nDEX: ${dexType}`,
        }],
      };
    }

    // Collect fee in hosted mode (post-swap SOL transfer)
    let feeTx: string | null = null;
    if (config.feeAccount && config.feeBps) {
      try {
        const connection = new Connection(config.rpcUrl, 'confirmed');
        feeTx = await collectFee(connection, keypair, amountSol, config.feeAccount, config.feeBps);
      } catch { /* fee failure should not fail the trade */ }
    }

    const outputTokens = (result.outputAmount ?? quote.outputAmount) / 1_000_000;
    const lines: string[] = [];
    lines.push(`Buy successful via ${dexType === 'pumpfun' ? 'PumpFun' : 'Jupiter'}`);
    lines.push('');
    lines.push(`  Spent: ${amountSol.toFixed(4)} SOL`);
    lines.push(`  Received: ~${outputTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`);
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
        text: `Buy failed (${dexType}): ${message}`,
      }],
    };
  }
}
