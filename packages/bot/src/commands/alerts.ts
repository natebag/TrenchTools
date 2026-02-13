import { Context } from 'grammy';
import { stateManager } from '../state/index.js';

export async function alertsCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  
  if (parts.length < 2) {
    const current = stateManager.isAlertsEnabled();
    await ctx.reply(
      `🔔 *Alerts: ${current ? 'ON' : 'OFF'}*\n\n` +
      `Usage: /alerts on\\|off\n\n` +
      `When enabled, you'll receive notifications for each trade\\.`,
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  const setting = parts[1].toLowerCase();

  if (setting !== 'on' && setting !== 'off') {
    await ctx.reply(
      '❌ Invalid option\\. Use `/alerts on` or `/alerts off`',
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  const enabled = setting === 'on';
  stateManager.setAlertsEnabled(enabled);

  await ctx.reply(
    `🔔 *Alerts ${enabled ? 'Enabled' : 'Disabled'}*\n\n` +
    `You will ${enabled ? 'now' : 'no longer'} receive trade notifications\\.`,
    { parse_mode: 'MarkdownV2' }
  );
}
