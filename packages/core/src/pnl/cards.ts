/**
 * P&L Cards - Formatted profit/loss displays
 */
import { PositionPnL, TokenPnL, WalletPnL, PnLReport } from './types.js';

// Colors and emojis
const EMOJI = {
  profit: '🟢',
  loss: '🔴',
  neutral: '⚪',
  up: '📈',
  down: '📉',
  flat: '➖',
  fire: '🔥',
  rocket: '🚀',
  warning: '⚠️',
  star: '⭐',
  money: '💰',
  chart: '📊',
  calendar: '🗓️',
  wallet: '👛',
  token: '🪙',
};

/**
 * Generic P&L card interface
 */
export interface PnLCard {
  title: string;
  value: string;
  change?: string;
  trend: 'up' | 'down' | 'flat';
  emoji: string;
  details?: Record<string, string>;
}

/**
 * Format SOL amount
 */
export function formatSol(amount: number): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(2)}k`;
  return amount.toFixed(4);
}

/**
 * Format percent with sign
 */
export function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Get trend emoji
 */
export function getTrendEmoji(value: number): string {
  if (value > 0) return EMOJI.up;
  if (value < 0) return EMOJI.down;
  return EMOJI.flat;
}

/**
 * Profit Card - Telegram friendly
 */
export function createProfitCard(pnl: number, title = 'P&L'): PnLCard {
  const trend = pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'flat';
  const emoji = pnl > 0 ? EMOJI.profit : pnl < 0 ? EMOJI.loss : EMOJI.neutral;

  return {
    title,
    value: `${formatSol(pnl)} SOL`,
    change: formatPercent(pnl),
    trend,
    emoji,
  };
}

/**
 * Loss Card - Telegram friendly
 */
export function createLossCard(pnl: number): PnLCard {
  const trend = pnl > 0 ? 'down' : 'up'; // Loss card shows inverse
  const emoji = pnl < 0 ? EMOJI.loss : EMOJI.profit;

  return {
    title: 'Loss',
    value: `${formatSol(Math.abs(pnl))} SOL`,
    change: formatPercent(pnl),
    trend,
    emoji,
  };
}

/**
 * Summary Card - Portfolio overview
 */
export function createSummaryCard(report: PnLReport): PnLCard {
  const total = report.totalPnLSol;
  const trend = total > 0 ? 'up' : total < 0 ? 'down' : 'flat';
  const emoji = total > 0 ? EMOJI.fire : total < 0 ? EMOJI.warning : EMOJI.neutral;

  return {
    title: 'Portfolio Summary',
    value: `${formatSol(total)} SOL`,
    change: formatPercent(report.totalPnLPercent),
    trend,
    emoji,
    details: {
      'Realized': `${formatSol(report.realizedPnLSol)} SOL`,
      'Unrealized': `${formatSol(report.unrealizedPnLSol)} SOL`,
      'Win Rate': `${report.winRate.toFixed(1)}%`,
      'Trades': `${report.totalTrades}`,
    },
  };
}

/**
 * Position Card - Single position detail
 */
export function createPositionCard(position: PositionPnL): PnLCard {
  const total = position.totalPnLSol;
  const trend = total > 0 ? 'up' : total < 0 ? 'down' : 'flat';
  const emoji = total > 0 ? EMOJI.profit : total < 0 ? EMOJI.loss : EMOJI.neutral;

  return {
    title: `${position.tokenSymbol || 'Token'} Position`,
    value: `${formatSol(total)} SOL`,
    change: formatPercent(position.totalPnLPercent),
    trend,
    emoji,
    details: {
      'Entry': `${formatSol(position.entryPrice)} SOL`,
      'Current': `${formatSol(position.currentPrice)} SOL`,
      'Amount': position.tokenAmount.toString(),
      'Realized': `${formatSol(position.realizedPnLSol)} SOL`,
    },
  };
}

/**
 * Token Card - Aggregate per token
 */
export function createTokenCard(token: TokenPnL): PnLCard {
  const total = token.totalPnLSol;
  const trend = total > 0 ? 'up' : total < 0 ? 'down' : 'flat';
  const emoji = total > 0 ? EMOJI.rocket : total < 0 ? EMOJI.warning : EMOJI.neutral;

  const bestMult = token.bestMultiplier.toFixed(1);
  const worstMult = token.worstMultiplier.toFixed(1);

  return {
    title: `$${token.tokenSymbol}`,
    value: `${formatSol(total)} SOL`,
    change: formatPercent(token.totalPnLPercent),
    trend,
    emoji,
    details: {
      'Trades': `${token.totalTrades}`,
      'Best': `${bestMult}x`,
      'Worst': `${worstMult}x`,
      'Avg Buy': `${formatSol(token.avgBuyPrice)} SOL`,
    },
  };
}

/**
 * Wallet Card - Per wallet summary
 */
export function createWalletCard(wallet: WalletPnL): PnLCard {
  const total = wallet.totalPnLSol;
  const trend = total > 0 ? 'up' : total < 0 ? 'down' : 'flat';
  const emoji = total > 0 ? EMOJI.money : total < 0 ? EMOJI.loss : EMOJI.neutral;

  const short = `${wallet.walletAddress.slice(0, 4)}...${wallet.walletAddress.slice(-4)}`;

  return {
    title: `Wallet ${short}`,
    value: `${formatSol(total)} SOL`,
    change: formatPercent(wallet.totalPnLPercent),
    trend,
    emoji,
    details: {
      'Win Rate': `${wallet.winRate.toFixed(1)}%`,
      'Wins/Losses': `${wallet.winCount}/${wallet.lossCount}`,
      'Tokens': `${wallet.totalTokens}`,
      'Trades': `${wallet.totalTrades}`,
    },
  };
}

/**
 * Format card for Telegram message
 */
export function formatTelegramCard(card: PnLCard): string {
  let message = `${card.emoji} *${card.title}*\n`;
  message += `💰 \`${card.value}\``;

  if (card.change) {
    const trendEmoji = card.trend === 'up' ? '📈' : card.trend === 'down' ? '📉' : '➖';
    message += ` ${trendEmoji} ${card.change}`;
  }

  if (card.details && Object.keys(card.details).length > 0) {
    message += '\n\n';
    for (const [k, v] of Object.entries(card.details)) {
      message += `• ${k}: \`${v}\`\n`;
    }
  }

  return message;
}

/**
 * Format card for Web UI (JSON)
 */
export function formatWebCard(card: PnLCard): Record<string, any> {
  return {
    title: card.title,
    value: card.value,
    change: card.change,
    trend: card.trend,
    emoji: card.emoji,
    details: card.details || {},
    color:
      card.trend === 'up'
        ? '#10b981'
        : card.trend === 'down'
        ? '#ef4444'
        : '#6b7280',
  };
}

/**
 * Format portfolio dashboard
 */
export function formatPortfolioDashboard(report: PnLReport): string {
  let output = `📊 *P&L Dashboard*\n`;
  output += `Generated: ${new Date(report.generatedAt).toLocaleDateString()}\n\n`;

  output += `*SUMMARY*\n`;
  output += createTelegramCard(createSummaryCard(report));
  output += '\n\n';

  if (report.tokens.length > 0) {
    output += `*TOP TOKENS*\n`;
    const top = report.tokens.slice(0, 5);
    for (const t of top) {
      output += `• $${t.tokenSymbol}: ${formatSol(t.totalPnLSol)} SOL (${formatPercent(t.totalPnLPercent)})\n`;
    }
  }

  return output;
}

/**
 * Format all positions
 */
export function formatAllPositions(positions: PositionPnL[]): string {
  if (positions.length === 0) return 'No open positions';
  let output = `📈 *Open Positions (${positions.length})*\n\n`;
  for (const pos of positions.slice(0, 10)) {
    const card = createPositionCard(pos);
    output += `${card.emoji} ${pos.tokenSymbol}: ${card.value} (${card.change})\n`;
  }
  if (positions.length > 10) {
    output += `\n... and ${positions.length - 10} more`;
  }
  return output;
}
