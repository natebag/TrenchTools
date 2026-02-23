import { z } from 'zod';
import type { MCPConfig } from '../config.js';

export const toolName = 'trench_polymarket_search';
export const toolDescription = 'Search Polymarket prediction markets by keyword, or get trending markets if no query is provided.';

export const toolSchema = z.object({
  query: z.string().optional().describe('Search query. Omit for trending markets.'),
  limit: z.number().int().min(1).max(20).optional().default(5).describe('Max results'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, _config: MCPConfig) {
  const { searchMarkets, getTrendingMarkets } = await import('@trenchtools/core');

  const markets = args.query
    ? await searchMarkets({ query: args.query, active: true, limit: args.limit })
    : await getTrendingMarkets(args.limit);

  if (!markets.length) {
    return { content: [{ type: 'text' as const, text: 'No markets found.' }] };
  }

  const lines = markets.map((m, i) => {
    const yes = m.tokens?.find(t => t.outcome === 'Yes');
    const no = m.tokens?.find(t => t.outcome === 'No');
    return [
      `${i + 1}. ${m.question}`,
      `   YES: ${((yes?.price ?? 0) * 100).toFixed(1)}%  NO: ${((no?.price ?? 0) * 100).toFixed(1)}%`,
      `   Volume: $${Math.round(m.volume).toLocaleString()}  Liquidity: $${Math.round(m.liquidity).toLocaleString()}`,
      `   ID: ${m.conditionId}`,
      m.endDate ? `   Ends: ${new Date(m.endDate).toLocaleDateString()}` : '',
    ].filter(Boolean).join('\n');
  });

  return { content: [{ type: 'text' as const, text: lines.join('\n\n') }] };
}
