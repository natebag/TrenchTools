import { Context } from 'grammy';
import { stateManager } from '../state/index.js';

function isValidSolanaMint(address: string): boolean {
  // Basic validation: Solana addresses are base58 encoded, 32-44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export async function startBoostCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  
  if (parts.length < 2) {
    await ctx.reply(
      '❌ *Usage:* `/start_boost <token_mint>`\n\n' +
      'Example:\n`/start_boost 7xKXtFpNQ9mDxv3qL8cMp2Z4hT5nY1rK8aW9bX6jMn`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const tokenMint = parts[1];

  if (!isValidSolanaMint(tokenMint)) {
    await ctx.reply(
      '❌ *Invalid token mint address*\n\n' +
      'Please provide a valid Solana mint address\\.',
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  const result = stateManager.startBoost(tokenMint);

  if (result.success) {
    await ctx.reply(
      `🚀 *Boost Started\\!*\n\n` +
      `*Token:* \`${tokenMint}\`\n\n` +
      `Volume boosting is now active\\. Use /status to monitor progress\\.\n\n` +
      `💡 Tip: Enable /alerts on to receive trade notifications\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  } else {
    await ctx.reply(
      `❌ *Failed to start boost*\n\n${result.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

export async function stopBoostCommand(ctx: Context): Promise<void> {
  const result = stateManager.stopBoost();

  if (result.success && result.stats) {
    const stats = result.stats;
    const duration = stats.startedAt 
      ? Math.floor((Date.now() - stats.startedAt.getTime()) / 1000 / 60)
      : 0;

    await ctx.reply(
      `🛑 *Boost Stopped*\n\n` +
      `*Session Summary:*\n` +
      `• Duration: ${duration} minutes\n` +
      `• Volume Generated: ${stats.volumeGenerated.toFixed(4)} SOL\n` +
      `• Trades Executed: ${stats.tradesExecuted}\n` +
      `• Success Rate: ${stats.successRate.toFixed(1)}%\n` +
      `• SOL Spent: ${stats.solSpent.toFixed(4)}\n\n` +
      `Ready for next session\\. Use /start\\_boost to begin\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  } else {
    await ctx.reply(
      `❌ ${result.message}\n\nUse /start_boost <token> to begin a session.`,
      { parse_mode: 'Markdown' }
    );
  }
}
