/**
 * /portfolio command - Show wallet holdings and PnL
 */
import { Context } from 'telegraf';

interface TokenHolding {
  symbol: string;
  mint: string;
  balance: number;
  valueUsd: number;
  pnlPercent: number;
}

export function registerPortfolioCommand(bot: any) {
  bot.command('portfolio', async (ctx: Context) => {
    // Mock data - would be fetched from wallet/sniper
    const holdings: TokenHolding[] = [
      { symbol: 'BONK', mint: 'DezX...', balance: 1500000, valueUsd: 245.50, pnlPercent: 45.2 },
      { symbol: 'WIF', mint: '2U5H...', balance: 250, valueUsd: 892.00, pnlPercent: -12.5 },
      { symbol: 'MEW', mint: 'MEW1...', balance: 500000, valueUsd: 125.00, pnlPercent: 8.3 },
    ];

    const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    const avgPnl = holdings.length > 0
      ? holdings.reduce((sum, h) => sum + h.pnlPercent, 0) / holdings.length
      : 0;

    let message = `💼 <b>Your Portfolio</b>\n\n`;
    message += `💰 <b>Total Value:</b> $${totalValue.toFixed(2)}\n`;
    message += `📈 <b>Avg PnL:</b> ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%\n`;
    message += `🪙 <b>Tokens:</b> ${holdings.length}\n\n`;

    message += `<b>Holdings:</b>\n`;
    for (const token of holdings) {
      const pnlEmoji = token.pnlPercent >= 0 ? '🟢' : '🔴';
      const pnlSign = token.pnlPercent >= 0 ? '+' : '';
      message += `\n${pnlEmoji} <b>$${token.symbol}</b>\n`;
      message += `   Balance: ${token.balance.toLocaleString()}\n`;
      message += `   Value: $${token.valueUsd.toFixed(2)}\n`;
      message += `   PnL: ${pnlSign}${token.pnlPercent.toFixed(2)}%\n`;
      message += `   <code>${token.mint}</code>`;
    }

    message += `\n\n<i>Use /refresh to update balances</i>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  bot.command('refresh', async (ctx: Context) => {
    const loadingMsg = await ctx.reply('🔄 Refreshing portfolio data...');
    
    // Simulate refresh delay
    await new Promise(r => setTimeout(r, 1500));
    
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      loadingMsg.message_id,
      undefined,
      '✅ Portfolio updated!',
      { parse_mode: 'HTML' }
    );

    // Re-show portfolio
    await ctx.replyWithCommand('/portfolio');
  });

  bot.command('pnl', async (ctx: Context) => {
    const message = `📊 <b>Profit & Loss Summary</b>

<b>Today:</b>
• Realized PnL: +$45.20
• Unrealized PnL: -$12.50
• Total Trades: 5
• Win Rate: 60%

<b>This Week:</b>
• Realized PnL: +$124.80
• Best Trade: +$67.00 (BONK)
• Worst Trade: -$15.30 (WIF)

<b>All Time:</b>
• Total Realized: +$892.45
• Total Volume: $2,450.00
• ROI: +36.4%`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });
}
