/**
 * Trading Types - Core trading primitives for TrenchSniper OS
 */
import { PublicKey, Keypair } from '@solana/web3.js';

export type DEX = 'pumpfun' | 'raydium' | 'jupiter' | 'orca' | 'meteora';

/** Token metadata */
export interface TokenInfo {
  mint: string;
  symbol: string;
  name?: string;
  decimals: number;
  totalSupply?: bigint;
}

/** Base quote parameters */
export interface QuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps: number;
}

/** Quote request options */
export interface QuoteRequestOptions {
  maxAccounts?: number;
  onlyDirectRoutes?: boolean;
  filterTopNResult?: number;
  /**
   * The token list including intermediate tokens
   */
  intermediateTokens?: string[];
  /**
   * The max accounts in the path
   */
  maxAccountsInPath?: number;
}

/** Swap result from any DEX */
export interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  fee: number;
  slot: number;
  timestamp: number;
}

/** Swap parameters */
export interface SwapParams {
  wallet: Keypair;
  quote: Quote;
  priorityFee?: number | 'auto';
}

/** Pool information */
export interface Pool {
  id: string;
  dex: DEX;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  liquidity: number;
  volume24h: number;
  feeRate?: number;
}

/** Quote response from any DEX */
export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  priceImpactPct: number;
  route: RouteStep[];
  dex: DEX;
  timestamp: number;
  expiresAt: number;
}

/** Route step in a swap */
export interface RouteStep {
  dex: string;
  inputMint: string;
  outputMint: string;
  poolId: string;
  percent: number;
}

/** Bonding curve state for PumpFun */
export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

/** Migration event */
export interface MigrationEvent {
  tokenMint: string;
  fromDex: DEX;
  toDex: DEX;
  timestamp: number;
  signature: string;
}

/** Custom errors */
export class NoRouteError extends Error {
  constructor(inputMint: string, outputMint: string) {
    super(`No route found from ${inputMint} to ${outputMint}`);
    this.name = 'NoRouteError';
  }
}

export class APIError extends Error {
  constructor(public dex: string, message: string) {
    super(`[${dex}] ${message}`);
    this.name = 'APIError';
  }
}

export class SwapTransactionError extends Error {
  constructor(message: string, public signature?: string) {
    super(message);
    this.name = 'SwapTransactionError';
  }
}

export class InsufficientFundsError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient funds: required ${required}, available ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

export class SlippageExceededError extends Error {
  constructor(expected: number, received: number) {
    super(`Slippage exceeded: expected ${expected}, received ${received}`);
    this.name = 'SlippageExceededError';
  }
}

/** Priority fee levels */
export type PriorityFeeLevel = 'none' | 'low' | 'medium' | 'high' | 'ultra';

export const PRIORITY_FEES: Record<PriorityFeeLevel, number> = {
  none: 0,
  low: 5000,        // 0.000005 SOL
  medium: 50000,    // 0.00005 SOL
  high: 200000,     // 0.0002 SOL
  ultra: 1000000,   // 0.001 SOL
};

/** Transaction priority config */
export interface PriorityConfig {
  level: PriorityFeeLevel;
  customFee?: number;
  jitoTip?: number;
}

/** Token launch info */
export interface TokenLaunch {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  timestamp: number;
  marketCapSol: number;
}

/** Snipe configuration */
export interface SnipeConfig {
  maxSlippageBps: number;
  priorityFee: PriorityConfig;
  jitoEnabled: boolean;
  minLiquiditySol: number;
  maxMarketCapSol: number;
  autoSellEnabled: boolean;
  autoSellConfig?: {
    takeProfitMultiplier: number;
    stopLossPercent: number;
  };
}

/** Snipe result */
export interface SnipeResult {
  success: boolean;
  signature?: string;
  tokenMint: string;
  tokenSymbol?: string;
  amountIn: number;
  amountOut: number;
  error?: string;
  timestamp: number;
  slot?: number;
}
