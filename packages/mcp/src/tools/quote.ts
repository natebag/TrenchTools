import { z } from 'zod';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { detectDex, getQuote } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';

export const toolName = 'trench_quote';
export const toolDescription = 'Get a swap quote with auto-routing (PumpFun bonding curve or Jupiter). Provide amountSol for a buy quote, or amountTokens for a sell quote.';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address'),
  amountSol: z.number().positive().optional().describe('SOL amount to spend (for buying). Mutually exclusive with amountTokens.'),
  amountTokens: z.number().positive().optional().describe('Token amount to sell (raw, smallest unit). Mutually exclusive with amountSol.'),
  slippageBps: z.number().int().min(1).max(5000).optional().describe('Slippage tolerance in basis points (default: from config, usually 500)'),
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

export async function handler(args: ToolInput, config: MCPConfig) {
  const { tokenMint, amountSol, amountTokens, slippageBps } = args;

  if (!amountSol && !amountTokens) {
    return {
      content: [{
        type: 'text' as const,
        text: 'Error: Provide either amountSol (to buy) or amountTokens (to sell).',
      }],
    };
  }

  if (amountSol && amountTokens) {
    return {
      content: [{
        type: 'text' as const,
        text: 'Error: Provide either amountSol or amountTokens, not both.',
      }],
    };
  }

  const isBuy = !!amountSol;
  const dexType = await detectDex(tokenMint, config.rpcUrl);
  const dexConfig = getDexConfig(config, slippageBps);

  let inputMint: string;
  let outputMint: string;
  let amount: number;

  if (isBuy) {
    inputMint = KNOWN_MINTS.WSOL;
    outputMint = tokenMint;
    amount = Math.round(amountSol! * LAMPORTS_PER_SOL);
  } else {
    inputMint = tokenMint;
    outputMint = KNOWN_MINTS.WSOL;
    amount = Math.round(amountTokens!);
  }

  try {
    const quote = await getQuote(dexType, inputMint, outputMint, amount, dexConfig);

    const lines: string[] = [];
    lines.push(`Quote: ${isBuy ? 'BUY' : 'SELL'} via ${dexType === 'pumpfun' ? 'PumpFun' : 'Jupiter'}`);
    lines.push('');

    if (isBuy) {
      const inputSol = quote.inputAmount / LAMPORTS_PER_SOL;
      // PumpFun tokens are 6 decimals; for Jupiter, assume 6 as common default
      const outputTokens = quote.outputAmount / 1_000_000;
      lines.push(`  Spend: ${inputSol.toFixed(4)} SOL`);
      lines.push(`  Receive: ~${outputTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`);
    } else {
      const inputTokens = quote.inputAmount / 1_000_000;
      const outputSol = quote.outputAmount / LAMPORTS_PER_SOL;
      lines.push(`  Sell: ${inputTokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens`);
      lines.push(`  Receive: ~${outputSol.toFixed(4)} SOL`);
    }

    lines.push(`  Price Impact: ${quote.priceImpactPct.toFixed(2)}%`);
    lines.push(`  Slippage: ${quote.slippageBps} bps (${(quote.slippageBps / 100).toFixed(1)}%)`);
    lines.push('');
    lines.push('Use trench_buy or trench_sell to execute this trade.');

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Quote failed (${dexType}): ${message}`,
      }],
    };
  }
}
