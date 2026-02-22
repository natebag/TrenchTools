import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { getSessionsByType } from '../lib/sessions.js';

export const toolName = 'trench_activity_status';
export const toolDescription =
  'Check the status of the current activity generation session. Shows progress, time remaining, and transaction counts.';

export const toolSchema = z.object({});

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

function formatTimeRemaining(endTime: Date): string {
  const ms = endTime.getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export async function handler(_args: ToolInput, _config: MCPConfig) {
  const sessions = getSessionsByType('activity');

  if (sessions.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No activity sessions found. Use trench_activity_start to begin.',
      }],
    };
  }

  const lines: string[] = [];

  for (const session of sessions) {
    const { stats } = session;
    const successRate = stats.tradesExecuted > 0
      ? ((stats.tradesSuccessful / stats.tradesExecuted) * 100).toFixed(1)
      : '0.0';

    lines.push(`Activity Session: ${session.id}`);
    lines.push(`  Status: ${session.running ? 'RUNNING' : 'STOPPED'}`);
    lines.push(`  Uptime: ${formatUptime(stats.startedAt)}`);

    if (session.endTime) {
      lines.push(`  Time remaining: ${formatTimeRemaining(session.endTime)}`);
      lines.push(`  Ends at: ${session.endTime.toISOString()}`);
    }
    if (session.durationHours) {
      lines.push(`  Duration: ${session.durationHours}h`);
    }

    lines.push(`  Transactions: ${stats.tradesExecuted} (${stats.tradesSuccessful} OK / ${stats.tradesFailed} failed)`);
    lines.push(`  Success rate: ${successRate}%`);
    lines.push(`  Volume: ${stats.volumeSol.toFixed(4)} SOL`);
    lines.push(`  Wallets: ${session.walletAddresses.length}`);
    lines.push('');
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n').trimEnd() }],
  };
}
