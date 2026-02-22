import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { detectDex } from '../lib/dex/index.js';

export const toolName = 'trench_token_info';
export const toolDescription = 'Get token information from DexScreener: price, market cap, volume, liquidity, and whether the token is on PumpFun or Jupiter.';

export const toolSchema = z.object({
  tokenMint: z.string().describe('Token mint address'),
});

export type ToolInput = z.infer<typeof toolSchema>;

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  marketCap: number;
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const { tokenMint } = args;

  // Fetch DexScreener data and detect DEX in parallel
  const [dexScreenerResp, dexType] = await Promise.all([
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`),
    detectDex(tokenMint, config.rpcUrl),
  ]);

  if (!dexScreenerResp.ok) {
    return {
      content: [{
        type: 'text' as const,
        text: `DexScreener API error (${dexScreenerResp.status}). Token may not be listed yet.`,
      }],
    };
  }

  const data = await dexScreenerResp.json() as { pairs: DexScreenerPair[] | null };
  const pairs = data.pairs;

  if (!pairs || pairs.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `No trading pairs found for ${tokenMint}.\nDEX routing: ${dexType === 'pumpfun' ? 'PumpFun (bonding curve active)' : 'Jupiter'}`,
      }],
    };
  }

  // Use highest-liquidity pair
  const pair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

  const lines: string[] = [];
  lines.push(`Token: ${pair.baseToken.name} (${pair.baseToken.symbol})`);
  lines.push(`Mint: ${pair.baseToken.address}`);
  lines.push(`DEX routing: ${dexType === 'pumpfun' ? 'PumpFun (bonding curve)' : 'Jupiter (graduated)'}`);
  lines.push(`Trading on: ${pair.dexId}`);
  lines.push('');

  lines.push('--- Price ---');
  lines.push(`  USD: $${pair.priceUsd}`);
  lines.push(`  SOL: ${pair.priceNative} SOL`);
  lines.push('');

  lines.push('--- Market ---');
  lines.push(`  Market Cap: ${formatUsd(pair.marketCap || pair.fdv || 0)}`);
  lines.push(`  FDV: ${formatUsd(pair.fdv || 0)}`);
  lines.push(`  Liquidity: ${formatUsd(pair.liquidity?.usd || 0)}`);
  lines.push('');

  lines.push('--- Volume ---');
  lines.push(`  5m: ${formatUsd(pair.volume?.m5 || 0)}`);
  lines.push(`  1h: ${formatUsd(pair.volume?.h1 || 0)}`);
  lines.push(`  6h: ${formatUsd(pair.volume?.h6 || 0)}`);
  lines.push(`  24h: ${formatUsd(pair.volume?.h24 || 0)}`);
  lines.push('');

  lines.push('--- Price Change ---');
  lines.push(`  5m: ${pair.priceChange?.m5 >= 0 ? '+' : ''}${formatNumber(pair.priceChange?.m5 || 0)}%`);
  lines.push(`  1h: ${pair.priceChange?.h1 >= 0 ? '+' : ''}${formatNumber(pair.priceChange?.h1 || 0)}%`);
  lines.push(`  6h: ${pair.priceChange?.h6 >= 0 ? '+' : ''}${formatNumber(pair.priceChange?.h6 || 0)}%`);
  lines.push(`  24h: ${pair.priceChange?.h24 >= 0 ? '+' : ''}${formatNumber(pair.priceChange?.h24 || 0)}%`);
  lines.push('');

  if (pair.txns?.h24) {
    lines.push('--- Transactions (24h) ---');
    lines.push(`  Buys: ${formatNumber(pair.txns.h24.buys)}`);
    lines.push(`  Sells: ${formatNumber(pair.txns.h24.sells)}`);
  }

  lines.push('');
  lines.push(`DexScreener: https://dexscreener.com/solana/${tokenMint}`);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
