import 'dotenv/config';
import { createBot, setCommands, setupAlertHandler } from './bot.js';
import { createServer } from './server/index.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID;

async function main() {
  console.log('🎯 TrenchSniper Bot starting...');

  // Create and start Express server
  const server = createServer(API_PORT);
  await server.start();

  if (!BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set; running API server only');
    console.warn('   Create a .env file with: TELEGRAM_BOT_TOKEN=your_token');
    return;
  }

  // Create bot
  const bot = createBot(BOT_TOKEN);

  // Set up alert handler if chat ID is configured
  if (ALERT_CHAT_ID) {
    setupAlertHandler(bot, parseInt(ALERT_CHAT_ID, 10));
    console.log(`🔔 Alerts configured for chat ${ALERT_CHAT_ID}`);
  }

  // Set bot commands (shows in Telegram menu)
  await setCommands(bot);
  console.log('📋 Bot commands registered');

  // Start bot
  console.log('🤖 Bot is running...');
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} is online!`);
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down...');
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

// Export for library use
export { createBot, setCommands, setupAlertHandler } from './bot.js';
export { createServer } from './server/index.js';
export { stateManager } from './state/index.js';
export type { AppState, BoostState, WalletInfo, BoostStats } from './state/index.js';
