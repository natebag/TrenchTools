import { Context } from 'grammy';
import { stateManager } from '../state/index.js';

export async function statsCommand(ctx: Context): Promise<void> {
  const stats = stateManager.get24hStats();
  
  const message = `
📊 *24h Statistics*

*Volume Generated:*
└ ${stats.volume.toFixed(2)} SOL

*Trades Executed:*
└ ${stats.trades} trades

*Success Rate:*
└ ${stats.successRate.toFixed(1)}%

*SOL Spent \\(fees\\):*
└ ${stats.solSpent.toFixed(4)} SOL

*Efficiency:*
└ ${((stats.volume / stats.solSpent) || 0).toFixed(1)}x return

━━━━━━━━━━━━━━━
_Updated in real\\-time_
`.trim();

  await ctx.reply(message, { parse_mode: 'MarkdownV2' });
}
