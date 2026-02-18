/**
 * Multi-DEX abstraction layer
 * 
 * Provides a unified interface for swapping across multiple DEXs:
 * - Jupiter (fully implemented) - Aggregator with best prices
 * - Raydium (stub) - AMM/CLMM pools
 * - Meteora (stub) - DLMM pools
 * - PumpFun (stub) - Bonding curve for new tokens
 */

export * from './types';

import { jupiterSwapper } from './jupiter';
import { raydiumSwapper } from './raydium';
import { meteoraSwapper } from './meteora';
import { pumpfunSwapper } from './pumpfun';
import type { DexSwapper, DexType, DexConfig, Quote, SwapResult } from './types';
import { DEX_INFO } from './types';

// Re-export individual swappers
export { jupiterSwapper, getHeliusPriorityFee } from './jupiter';
export { raydiumSwapper } from './raydium';
export { meteoraSwapper } from './meteora';
export { pumpfunSwapper } from './pumpfun';

/**
 * Registry of all DEX swappers
 */
export const DEX_SWAPPERS: Record<DexType, DexSwapper> = {
  jupiter: jupiterSwapper,
  raydium: raydiumSwapper,
  meteora: meteoraSwapper,
  pumpfun: pumpfunSwapper,
};

/**
 * Get a DEX swapper by type
 */
export function getSwapper(dexType: DexType): DexSwapper {
  const swapper = DEX_SWAPPERS[dexType];
  if (!swapper) {
    throw new Error(`Unknown DEX type: ${dexType}`);
  }
  return swapper;
}

/**
 * Get quote from a specific DEX
 */
export async function getQuote(
  dexType: DexType,
  inputMint: string,
  outputMint: string,
  amount: number,
  config: DexConfig
): Promise<Quote> {
  const swapper = getSwapper(dexType);
  return swapper.getQuote(inputMint, outputMint, amount, config);
}

/**
 * Execute swap on a specific DEX
 */
export async function executeSwap(
  quote: Quote,
  wallet: import('@solana/web3.js').Keypair,
  config: DexConfig
): Promise<SwapResult> {
  const swapper = getSwapper(quote.dex);
  return swapper.executeSwap(quote, wallet, config);
}

/**
 * Get list of all available DEXs with their info
 */
export function getAvailableDexes(): typeof DEX_INFO {
  return DEX_INFO;
}

/**
 * Get list of implemented (non-stub) DEXs
 */
export function getImplementedDexes(): DexType[] {
  return Object.values(DEX_SWAPPERS)
    .filter(s => s.isImplemented)
    .map(s => s.type);
}

/**
 * Check if a DEX is implemented
 */
export function isDexImplemented(dexType: DexType): boolean {
  return DEX_SWAPPERS[dexType]?.isImplemented ?? false;
}

/**
 * Default DEX to use
 */
export const DEFAULT_DEX: DexType = 'jupiter';
