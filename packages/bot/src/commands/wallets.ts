import { Context } from 'grammy';
import { stateManager } from '../state/index.js';

export async function walletsCommand(ctx: Context): Promise<void> {
  const wallets = stateManager.getWallets();
  
  if (wallets.length === 0) {
    await ctx.reply(
      '💰 *Wallets*\n\nNo wallets configured\\.',
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  
  const walletLines = wallets.map((w, i) => {
    const label = w.label ? ` \\(${w.label}\\)` : '';
    return `${i + 1}\\. \`${w.address}\`${label}\n   └ ${w.balance.toFixed(4)} SOL`;
  }).join('\n\n');

  const message = `
💰 *Wallets*

${walletLines}

━━━━━━━━━━━━━━━
*Total Balance:* ${totalBalance.toFixed(4)} SOL
`.trim();

  await ctx.reply(message, { parse_mode: 'MarkdownV2' });
}
