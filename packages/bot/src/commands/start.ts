import { Context } from 'grammy';

const WELCOME_MESSAGE = `
🎯 *TrenchSniper Bot*

Welcome to TrenchSniper OS - your volume boosting command center\\!

*Available Commands:*
/status \\- Check current boost status
/start\\_boost \\<token\\> \\- Start boosting a token
/stop\\_boost \\- Stop current boost session
/wallets \\- View wallet balances
/stats \\- View 24h statistics
/alerts on\\|off \\- Toggle trade notifications

*Quick Start:*
1\\. Use /wallets to check your SOL balances
2\\. Run /start\\_boost \\<mint\\_address\\> to begin
3\\. Monitor with /status or enable /alerts

Need help? Join our community or check the docs\\.
`;

export async function startCommand(ctx: Context): Promise<void> {
  await ctx.reply(WELCOME_MESSAGE, { parse_mode: 'MarkdownV2' });
}
