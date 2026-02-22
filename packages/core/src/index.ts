/**
 * @trenchtools/core
 * Core functionality for TrenchSniper OS
 */

// Chain definitions (multi-chain support)
export * from './chains/index.js';

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

// Launch - Printr multi-chain token launch
export * from './launch/index.js';

// Volume - PumpSwap venue detection and runout estimations
export * from './volume/index.js';

// Treasury - Main wallet funding
export {
  getTreasuryStatus,
  distributeFunds,
  autoFund,
  getSolBalance,
  getTokenBalances,
  getWalletBalance,
  subscribeToBalance,
  subscribeToTreasury,
  formatSolBalance,
  formatTokenBalance,
  formatTreasuryStatus,
  formatDistributionResult,
  getTreasuryQR,
  invalidateCache,
  invalidateAllCache,
} from './treasury/index.js';
export type {
  TreasuryConfig,
  TreasuryStatus,
  WalletBalance,
  DistributionResult,
  BalanceSubscription,
  TokenBalance as TreasuryTokenBalance,
} from './treasury/index.js';

// Logger
export { logger } from './logger.js';

// ============ Browser-Compatible Crypto ============
// Import from '@trenchtools/core/browser' for browser environments
// These exports are here for convenience but may cause issues with bundlers
// that don't tree-shake properly - prefer direct import from /browser
export {
  type BrowserEncryptedData,
  type BrowserWalletData,
  type BrowserWalletExport,
  BrowserCryptoError,
  BrowserInvalidPasswordError,
  BrowserDecryptionError,
  encryptForBrowser,
  decryptForBrowser,
  encryptWalletsForBrowser,
  decryptWalletsForBrowser,
  generateWalletId,
  isBrowserCryptoAvailable,
  BrowserWalletVault,
} from './browser/index.js';

// ============ Marketchoomba Integration ============

// Orchestrator - Bot management and market making
export * from './orchestrator/index.js';

// Detection - Manipulation detection (Powered by Allium)
export * from './detection/index.js';
