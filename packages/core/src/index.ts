/**
 * @trenchsniper/core
 * Core functionality for TrenchSniper OS
 */

// Wallet functionality
export * from './wallet/index.js';
export * from './wallet/withdraw.js';

// Trading types
export type {
  DEX,
  TokenInfo,
  QuoteParams,
  QuoteRequestOptions,
  SwapResult,
  SwapParams,
  Pool,
  Quote,
  RouteStep,
  BondingCurveState,
  MigrationEvent,
  PriorityFeeLevel,
  PriorityConfig,
  TokenLaunch,
  SnipeConfig,
  SnipeResult,
} from './trading/types.js';
export {
  NoRouteError,
  APIError,
  SwapTransactionError,
  SlippageExceededError,
  PRIORITY_FEES,
} from './trading/types.js';

// Snipe functionality
export * from './snipe/index.js';

// Sniper Guard (auto-sell, launch protection)
export { AutoSellEngine, SniperGuardManager } from './sniper-guard/index.js';
export type {
  PositionStatus,
  TriggerType,
  AutoSellConfig,
  Position,
  ExitRecord,
  ActiveTrigger,
  PriceUpdate,
  SellOrder,
  SellResult,
  GuardEvent,
  GuardStats,
} from './sniper-guard/types.js';
export {
  DEFAULT_AUTOSELL_CONFIG,
  TriggerAlreadyActiveError,
  SellExecutionError,
  PositionNotFoundError as SniperPositionNotFoundError,
} from './sniper-guard/types.js';

// P&L tracking
export { PnLCalculator, PnLTracker } from './pnl/index.js';
export type {
  TradeSide,
  TradeStatus,
  Trade,
  PositionPnL,
  TokenPnL,
  WalletPnL,
  PnLReport,
  DailyPnL,
  PnLFilter,
  PnLSummaryCard,
} from './pnl/types.js';
export {
  TradeNotFoundError,
  InvalidPnLFilterError,
  PositionNotFoundError as PnLPositionNotFoundError,
} from './pnl/types.js';

// Shield - Honeypot detection
export * from './shield/index.js';

// Revenue - Creator fees, transfers, buyback
export * from './revenue/index.js';

// Supply - Token burning
export * from './supply/index.js';

// Marketing - DexScreener, promotion
export * from './marketing/index.js';

// Activity - Wallet activity generator
export * from './activity/index.js';

// Liquidity - LP token locking
export * from './liquidity/index.js';

// Treasury - Main wallet funding
export * from './treasury/index.js';

// Logger
export { logger } from './logger.js';
