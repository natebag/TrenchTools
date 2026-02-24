import { z } from 'zod';
import { connectTokenStream, matchesFilter, type NewTokenAlert, type TokenAlertFilter } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';

export const toolName = 'trench_token_alerts';
export const toolDescription = 'Monitor new PumpFun token launches in real-time. Actions: start (begin monitoring), stop (end monitoring), recent (get collected alerts).';

export const toolSchema = z.object({
  action: z.enum(['start', 'stop', 'recent']).describe('Action: start monitoring, stop monitoring, or get recent alerts'),
  limit: z.number().optional().describe('Max alerts to return for "recent" action (default 20, max 50)'),
  minMarketCapSol: z.number().optional().describe('Filter: minimum market cap in SOL'),
  maxMarketCapSol: z.number().optional().describe('Filter: maximum market cap in SOL'),
});

export type ToolInput = z.infer<typeof toolSchema>;

// Persistent state within MCP process lifetime
let connection: { close: () => void } | null = null;
const collectedAlerts: NewTokenAlert[] = [];
const MAX_COLLECTED = 200;

export async function handler(args: ToolInput, config: MCPConfig) {
  if (args.action === 'start') {
    if (connection) {
      return { content: [{ type: 'text' as const, text: `Already monitoring. ${collectedAlerts.length} alerts collected so far.` }] };
    }

    connection = connectTokenStream({
      onAlert: (alert) => {
        collectedAlerts.unshift(alert);
        if (collectedAlerts.length > MAX_COLLECTED) collectedAlerts.length = MAX_COLLECTED;
      },
    });

    return { content: [{ type: 'text' as const, text: 'Started monitoring PumpFun new token launches. Use action: "recent" to fetch collected alerts.' }] };
  }

  if (args.action === 'stop') {
    if (!connection) {
      return { content: [{ type: 'text' as const, text: 'Not currently monitoring.' }] };
    }
    connection.close();
    connection = null;
    return { content: [{ type: 'text' as const, text: `Stopped monitoring. ${collectedAlerts.length} alerts collected.` }] };
  }

  if (args.action === 'recent') {
    const limit = Math.min(args.limit ?? 20, 50);
    const filter: TokenAlertFilter = {};
    if (args.minMarketCapSol != null) filter.minMarketCapSol = args.minMarketCapSol;
    if (args.maxMarketCapSol != null) filter.maxMarketCapSol = args.maxMarketCapSol;

    const hasFilter = Object.keys(filter).length > 0;
    const filtered = hasFilter
      ? collectedAlerts.filter(a => matchesFilter(a, filter)).slice(0, limit)
      : collectedAlerts.slice(0, limit);

    if (filtered.length === 0) {
      const hint = connection ? 'Alerts are being collected. Try again in a moment.' : 'Not monitoring. Run with action: "start" first.';
      return { content: [{ type: 'text' as const, text: `No alerts found. ${hint}` }] };
    }

    const lines = filtered.map((a, i) => {
      const creator = a.creator.slice(0, 6) + '...' + a.creator.slice(-4);
      const time = new Date(a.timestamp).toLocaleTimeString();
      return `${i + 1}. ${a.name} (${a.symbol})\n   CA: ${a.mint}\n   MCap: ${a.marketCapSol.toFixed(1)} SOL | Dev Buy: ${a.initialBuySol.toFixed(3)} SOL\n   Creator: ${creator} | ${time}`;
    });

    const header = `Found ${filtered.length} alert(s)${hasFilter ? ' (filtered)' : ''}:`;
    return { content: [{ type: 'text' as const, text: `${header}\n\n${lines.join('\n\n')}` }] };
  }

  return { content: [{ type: 'text' as const, text: 'Unknown action. Use: start, stop, or recent.' }] };
}
