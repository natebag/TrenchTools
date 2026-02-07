/**
 * Telegram Bot Configuration
 */
import dotenv from 'dotenv';
dotenv.config();

export interface BotConfig {
  token: string;
  adminIds: number[];
  webhookUrl?: string;
  features: {
    alerts: boolean;
    portfolio: boolean;
    sniperControl: boolean;
  };
}

export function getConfig(): BotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in environment');
  }

  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(id => !isNaN(id));

  return {
    token,
    adminIds,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    features: {
      alerts: process.env.FEATURE_ALERTS !== 'false',
      portfolio: process.env.FEATURE_PORTFOLIO !== 'false',
      sniperControl: process.env.FEATURE_SNIPER_CONTROL !== 'false',
    },
  };
}
