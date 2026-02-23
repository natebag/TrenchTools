/**
 * Main Telegram Bot class
 */
import { Telegraf, Context } from 'telegraf';
import { AlertManager, AlertData } from './alerts.js';
import { getConfig, BotConfig } from './config.js';
import { 
  registerSniperCommand, 
  registerPortfolioCommand, 
  registerAlertsCommand 
} from './commands/index.js';

export class TrenchBot {
  public bot: Telegraf<Context>;
  private config: BotConfig;
  private alertManager: AlertManager;
  private isRunning: boolean = false;

  constructor() {
    this.config = getConfig();
    this.bot = new Telegraf(this.config.token);
    this.alertManager = new AlertManager(this.bot);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Fail-closed: reject all commands from non-admin users
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || this.config.adminIds.length === 0 || !this.config.adminIds.includes(userId)) {
        // Allow /start to show a message, reject everything else
        if ((ctx.message as any)?.text?.startsWith('/start')) {
          await ctx.reply('⛔ Access denied. Your Telegram ID is not in the admin list.\n\nSet TELEGRAM_ADMIN_IDS in your .env to enable access.');
          return;
        }
        return; // Silently ignore non-admin messages
      }
      return next();
    });

    this.bot.command('start', async (ctx) => this.handleStart(ctx));
    this.bot.command('help', async (ctx) => this.handleHelp(ctx));

    if (this.config.features.sniperControl) registerSniperCommand(this.bot, this.alertManager);
    if (this.config.features.portfolio) registerPortfolioCommand(this.bot);
    if (this.config.features.alerts) registerAlertsCommand(this.bot);

    this.bot.command('broadcast', async (ctx) => this.handleBroadcast(ctx));
    this.bot.catch((err: any, ctx) => {
      console.error('Bot error:', err);
      ctx.reply('❌ Error occurred').catch(() => {});
    });
  }

  private async handleStart(ctx: Context): Promise<void> {
    const isAdmin = this.config.adminIds.includes(ctx.from?.id || 0);
    await ctx.reply(`🎯 <b>Welcome to TrenchSniper OS</b>

<b>Commands:</b>
/sniper - Snipe controls
/portfolio - View holdings  
/alerts - Alert settings
/status - System status
/help - Show help
${isAdmin ? '\n<b>Admin Access ✅</b>' : ''}`, { parse_mode: 'HTML' });
  }

  private async handleHelp(ctx: Context): Promise<void> {
    await ctx.reply(`📖 <b>Commands</b>

/sniper - Sniper controls
/portfolio - Holdings
/alerts - Alerts
/pnl - P&L summary
/status - Status
/refresh - Update data
/threshold <%> - Alert threshold`, { parse_mode: 'HTML' });
  }

  private async handleBroadcast(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId || !this.config.adminIds.includes(userId)) {
      await ctx.reply('⛔ Admin only'); return;
    }
    const text = (ctx.message as any)?.text?.split(' ').slice(1).join(' ') || '';
    if (!text) { await ctx.reply('Usage: /broadcast <msg>'); return; }
    await ctx.reply(`📢 Sent to ${this.config.adminIds.length} users`);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🤖 Starting Telegram bot...');
    await this.bot.launch();
    console.log('✅ Bot running');
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    await this.bot.stop();
    console.log('🛑 Bot stopped');
  }

  async sendAlert(userId: number, alert: AlertData): Promise<boolean> {
    return this.alertManager.sendAlert(userId, alert);
  }

  async broadcastAlert(alert: AlertData): Promise<number> {
    return this.alertManager.broadcastAlert(alert);
  }

  get isActive(): boolean { return this.isRunning; }
}

export function createBot(): TrenchBot { return new TrenchBot(); }
