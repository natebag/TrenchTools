import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { getSessionsByType } from '../lib/sessions.js';

export const toolName = 'trench_bot_status';
export const toolDescription =
  'Check status of bot groups. If name is provided, shows details for that specific group. Otherwise shows all bot groups.';

export const toolSchema = z.object({
  name: z.string().optional().describe('Bot group name. Omit to see all groups.'),
});

export type ToolInput = z.infer<typeof toolSchema>;

function formatUptime(startedAt: Date): string {
  const ms = Date.now() - startedAt.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function handler(args: ToolInput, _config: MCPConfig) {
  let sessions = getSessionsByType('bot');

  if (args.name) {
    sessions = sessions.filter(s => s.botName === args.name);
    if (sessions.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `No bot group found with name "${args.name}".`,
        }],
      };
    }
  }

  if (sessions.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No bot groups found. Use trench_bot_start to create one.',
      }],
    };
  }

  const lines: string[] = [];
  lines.push(`Bot Groups (${sessions.length}):`);
  lines.push('');

  for (const session of sessions) {
    const { stats } = session;
    const successRate = stats.tradesExecuted > 0
      ? ((stats.tradesSuccessful / stats.tradesExecuted) * 100).toFixed(1)
      : '0.0';

    lines.push(`  "${session.botName || 'unnamed'}"`);
    lines.push(`    Status: ${session.running ? 'RUNNING' : 'STOPPED'}`);
    lines.push(`    Session: ${session.id}`);
    lines.push(`    Token: ${session.tokenMint}`);
    lines.push(`    Wallets: ${session.walletAddresses.length}`);
    lines.push(`    Uptime: ${formatUptime(stats.startedAt)}`);
    lines.push(`    Trades: ${stats.tradesExecuted} (${stats.tradesSuccessful} OK / ${stats.tradesFailed} failed)`);
    lines.push(`    Success rate: ${successRate}%`);
    lines.push(`    Volume: ${stats.volumeSol.toFixed(4)} SOL`);
    lines.push('');
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n').trimEnd() }],
  };
}
