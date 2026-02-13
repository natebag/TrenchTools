import { Bot, Context } from 'grammy';
import {
  startCommand,
  statusCommand,
  startBoostCommand,
  stopBoostCommand,
  walletsCommand,
  statsCommand,
  alertsCommand,
} from './commands/index.js';
import { stateManager } from './state/index.js';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Register commands
  bot.command('start', startCommand);
  bot.command('status', statusCommand);
  bot.command('start_boost', startBoostCommand);
  bot.command('stop_boost', stopBoostCommand);
  bot.command('wallets', walletsCommand);
  bot.command('stats', statsCommand);
  bot.command('alerts', alertsCommand);

  // Handle unknown commands
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      await ctx.reply(
        '❓ Unknown command\\. Use /start to see available commands\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  return bot;
}

export function setupAlertHandler(bot: Bot, chatId: number): void {
  stateManager.onAlert(async (message) => {
    try {
      await bot.api.sendMessage(chatId, message);
    } catch (err) {
      console.error('Failed to send alert:', err);
    }
  });
}

export async function setCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Show welcome message and commands' },
    { command: 'status', description: 'Check current boost status' },
    { command: 'start_boost', description: 'Start boosting a token' },
    { command: 'stop_boost', description: 'Stop current boost session' },
    { command: 'wallets', description: 'View wallet balances' },
    { command: 'stats', description: 'View 24h statistics' },
    { command: 'alerts', description: 'Toggle trade notifications (on/off)' },
  ]);
}
