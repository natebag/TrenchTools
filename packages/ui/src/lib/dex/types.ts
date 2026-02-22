/**
 * Common DEX interface types for multi-DEX support
 */

import { Keypair } from '@solana/web3.js';
import type { ChainId } from '@trenchtools/core';

/**
 * Quote response from a DEX
 */
export interface Quote {
  dex: DexType;
  inputMint: string;
  outputMint: string;
  inputAmount: number;      // In smallest units (lamports / wei)
  outputAmount: number;     // In smallest units
  priceImpactPct: number;
  slippageBps: number;
  /** Chain this quote is for */
  chain?: ChainId;
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
  chain?: ChainId;
}

/**
 * Supported DEX types
 */
export type DexType = 'jupiter' | 'raydium' | 'meteora' | 'pumpfun' | 'openocean';

/**
 * DEX configuration options
 */
export interface DexConfig {
  rpcUrl: string;
  apiKey?: string;
  slippageBps?: number;     // Default: 200 (2%)
  heliusApiKey?: string;    // Optional: enables smart priority fee estimation
  /** Chain for this config (default: 'solana') */
  chain?: ChainId;
  /** EVM chain ID (56 for BSC, 8453 for Base) — set automatically from chain */
  evmChainId?: number;
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
  openocean: {
    type: 'openocean',
    name: 'OpenOcean',
    description: 'Cross-chain DEX aggregator (BSC, Base)',
    isImplemented: true,
    color: '#00D4AA',  // OpenOcean teal
    website: 'https://openocean.finance',
  },
};

/**
 * Well-known token mints (Solana)
 */
export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

/**
 * Native wrapped token addresses per EVM chain.
 * OpenOcean uses the 0xeee...eee address for native token (ETH/BNB).
 */
export const EVM_NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const KNOWN_EVM_TOKENS: Record<string, Record<string, string>> = {
  bsc: {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  },
  base: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
  },
};
