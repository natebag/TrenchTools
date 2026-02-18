/**
 * Common DEX interface types for multi-DEX support
 */

import { Keypair } from '@solana/web3.js';

/**
 * Quote response from a DEX
 */
export interface Quote {
  dex: DexType;
  inputMint: string;
  outputMint: string;
  inputAmount: number;      // In smallest units (lamports)
  outputAmount: number;     // In smallest units
  priceImpactPct: number;
  slippageBps: number;
  // DEX-specific data for executing the swap
  raw: unknown;
}

/**
 * Swap execution result
 */
export interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  wallet: string;           // Truncated wallet address
  inputAmount: number;
  outputAmount?: number;
}

/**
 * Supported DEX types
 */
export type DexType = 'jupiter' | 'raydium' | 'meteora' | 'pumpfun';

/**
 * DEX configuration options
 */
export interface DexConfig {
  rpcUrl: string;
  apiKey?: string;
  slippageBps?: number;     // Default: 200 (2%)
}

/**
 * Common interface all DEX swappers must implement
 */
export interface DexSwapper {
  /** Human-readable name */
  name: string;
  
  /** DEX identifier */
  type: DexType;
  
  /** Whether this DEX is fully implemented or just a stub */
  isImplemented: boolean;
  
  /** Get a quote for swapping tokens */
  getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,          // In lamports
    config: DexConfig
  ): Promise<Quote>;
  
  /** Execute a swap using the provided quote */
  executeSwap(
    quote: Quote,
    wallet: Keypair,
    config: DexConfig
  ): Promise<SwapResult>;
  
  /** Check if this DEX supports the given token pair */
  supportsTokenPair?(inputMint: string, outputMint: string): Promise<boolean>;
}

/**
 * DEX metadata for UI display
 */
export interface DexInfo {
  type: DexType;
  name: string;
  description: string;
  isImplemented: boolean;
  icon?: string;
  color: string;
  website: string;
}

/**
 * Registry of all DEX info for UI
 */
export const DEX_INFO: Record<DexType, DexInfo> = {
  jupiter: {
    type: 'jupiter',
    name: 'Jupiter',
    description: 'Best price aggregator across all Solana DEXs',
    isImplemented: true,
    color: '#4ADE80',  // green
    website: 'https://jup.ag',
  },
  raydium: {
    type: 'raydium',
    name: 'Raydium',
    description: 'AMM with concentrated liquidity',
    isImplemented: false,
    color: '#8B5CF6',  // purple
    website: 'https://raydium.io',
  },
  meteora: {
    type: 'meteora',
    name: 'Meteora',
    description: 'Dynamic liquidity market maker (DLMM)',
    isImplemented: false,
    color: '#F59E0B',  // amber
    website: 'https://meteora.ag',
  },
  pumpfun: {
    type: 'pumpfun',
    name: 'PumpFun',
    description: 'Bonding curve for memecoins',
    isImplemented: true,
    color: '#EC4899',  // pink
    website: 'https://pump.fun',
  },
};

/**
 * Well-known token mints
 */
export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;
