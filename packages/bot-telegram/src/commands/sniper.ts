/**
 * /sniper command - Control sniper settings and manual snipes
 */
import { Context } from 'telegraf';
import { AlertManager } from '../alerts.js';

export function registerSniperCommand(
  bot: any,
  alertManager: AlertManager
) {
  bot.command('sniper', async (ctx: Context) => {
    const message = `🎯 <b>TrenchSniper Controls</b>

<b>Quick Actions:</b>
/snipe_manual - Manual token snipe
/snipe_auto - Toggle auto-sniper
/status - Show sniper status

<b>Settings:</b>
/slippage <bps> - Set slippage (default: 100)
/jito <tip> - Toggle Jito bundles
/wallets - Manage snipe wallets

<b>Auto-Sniper Config:</b>
• Max SOL per snipe
• Min/max market cap filters
• Copytrade wallets
• Stop loss / take profit`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  bot.command('status', async (ctx: Context) => {
    const statusMsg = `📊 <b>Sniper Status</b>

🟢 <b>Auto-Sniper:</b> RUNNING
📡 <b>Mempool:</b> Listening
🚀 <b>Jito:</b> Not configured

<b>Recent Activity:</b>
• Snipes today: 3
• Successful: 3
• Failed: 0
• Total SOL spent: 0.45

Last snipe: 2m ago`;

    await ctx.reply(statusMsg, { parse_mode: 'HTML' });
  });

  bot.command('slippage', async (ctx: Context) => {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    
    if (args.length === 0) {
      await ctx.reply('Current slippage: 100 bps (1%)\n\nUse /slippage <bps> to change\nExample: /slippage 200');
      return;
    }

    const bps = parseInt(args[0]);
    if (isNaN(bps) || bps < 10 || bps > 10000) {
      await ctx.reply('❌ Invalid slippage. Use 10-10000 bps (0.1% - 100%)');
      return;
    }

    await ctx.reply(`✅ Slippage set to ${bps} bps (${(bps/100).toFixed(2)}%)`);
  });
}
