import { z } from 'zod';
import type { MCPConfig } from '../config.js';
import { getSessionsByType, stopSession, removeSession } from '../lib/sessions.js';

export const toolName = 'trench_volume_stop';
export const toolDescription =
  'Stop the running volume boosting session. Clears all trade loops and returns final stats.';

export const toolSchema = z.object({});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(_args: ToolInput, _config: MCPConfig) {
  const sessions = getSessionsByType('volume');
  const running = sessions.filter(s => s.running);

  if (running.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No running volume session to stop.',
      }],
    };
  }

  const lines: string[] = [];

  for (const session of running) {
    stopSession(session.id);

    const { stats } = session;
    const uptimeMs = Date.now() - stats.startedAt.getTime();
    const uptimeMin = (uptimeMs / 60_000).toFixed(1);
    const successRate = stats.tradesExecuted > 0
      ? ((stats.tradesSuccessful / stats.tradesExecuted) * 100).toFixed(1)
      : '0.0';

    lines.push(`Volume session ${session.id} stopped.`);
    lines.push('');
    lines.push('Final stats:');
    lines.push(`  Token: ${session.tokenMint}`);
    lines.push(`  Runtime: ${uptimeMin} minutes`);
    lines.push(`  Trades: ${stats.tradesExecuted} (${stats.tradesSuccessful} OK / ${stats.tradesFailed} failed)`);
    lines.push(`  Success rate: ${successRate}%`);
    lines.push(`  Volume generated: ${stats.volumeSol.toFixed(4)} SOL`);
    lines.push(`  Wallets used: ${session.walletAddresses.length}`);

    removeSession(session.id);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
