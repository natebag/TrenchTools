import { Context } from 'grammy';
import { stateManager } from '../state/index.js';

function formatDuration(start: Date): string {
  const ms = Date.now() - start.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export async function statusCommand(ctx: Context): Promise<void> {
  const boost = stateManager.getBoostState();
  const alertsEnabled = stateManager.isAlertsEnabled();

  if (!boost.isRunning) {
    await ctx.reply(
      `📊 *Status: IDLE*\n\n` +
      `No active boost session\\.\n\n` +
      `Use /start\\_boost \\<token\\_mint\\> to begin\\.`,
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  const duration = boost.stats.startedAt 
    ? formatDuration(boost.stats.startedAt) 
    : 'N/A';

  const message = `
🚀 *Status: BOOSTING*

*Token:* \`${boost.tokenMint}\`
*Duration:* ${duration}

📈 *Session Stats:*
• Volume: ${boost.stats.volumeGenerated.toFixed(4)} SOL
• Trades: ${boost.stats.tradesExecuted}
• Success Rate: ${boost.stats.successRate.toFixed(1)}%
• SOL Spent: ${boost.stats.solSpent.toFixed(4)}

🔔 Alerts: ${alertsEnabled ? 'ON' : 'OFF'}

Use /stop\\_boost to end session\\.
`.trim();

  await ctx.reply(message, { parse_mode: 'MarkdownV2' });
}
