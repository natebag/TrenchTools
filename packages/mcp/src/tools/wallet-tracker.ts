import { z } from 'zod';
import { Connection } from '@solana/web3.js';
import {
  fetchHoldings,
  fetchTrades,
  calculateStats,
  formatHoldingsReport,
  formatTradesReport,
  formatStatsReport,
} from '@trenchtools/core';
import type { MCPConfig } from '../config.js';

export const toolName = 'trench_wallet_tracker';
export const toolDescription = 'Track any Solana wallet: view token holdings, recent swap trades, and trader statistics (win rate, PnL). Actions: holdings, trades, stats.';

export const toolSchema = z.object({
  action: z.enum(['holdings', 'trades', 'stats']).describe('Action: holdings (token balances), trades (recent swaps), stats (trading statistics)'),
  address: z.string().describe('Solana wallet address to analyze'),
  limit: z.number().optional().describe('Max trades to return for "trades" action (default 20, max 50)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const heliusKey = config.heliusApiKey;

  try {
    if (args.action === 'holdings') {
      const holdings = await fetchHoldings(connection, args.address, heliusKey);
      const report = formatHoldingsReport(holdings);
      return { content: [{ type: 'text' as const, text: report }] };
    }

    if (args.action === 'trades') {
      const limit = Math.min(args.limit ?? 20, 50);
      const trades = await fetchTrades(args.address, heliusKey, limit);
      const report = formatTradesReport(trades);
      return { content: [{ type: 'text' as const, text: report }] };
    }

    if (args.action === 'stats') {
      const trades = await fetchTrades(args.address, heliusKey, 100);
      const stats = calculateStats(trades);
      const report = formatStatsReport(stats);
      return { content: [{ type: 'text' as const, text: report }] };
    }

    return { content: [{ type: 'text' as const, text: 'Unknown action. Use: holdings, trades, or stats.' }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Wallet tracker failed for ${args.address}: ${message}`,
      }],
    };
  }
}
