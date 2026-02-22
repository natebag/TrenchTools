/**
 * Multi-DEX abstraction layer
 *
 * Provides a unified interface for swapping across multiple DEXs:
 * - Jupiter (Solana) - Aggregator with best prices
 * - PumpFun (Solana) - Bonding curve for new tokens
 * - OpenOcean (BSC, Base) - Cross-chain DEX aggregator
 * - Raydium (stub) - AMM/CLMM pools
 * - Meteora (stub) - DLMM pools
 */

export * from './types';

import { jupiterSwapper } from './jupiter';
import { raydiumSwapper } from './raydium';
import { meteoraSwapper } from './meteora';
import { pumpfunSwapper } from './pumpfun';
import { openoceanSwapper } from './openocean';
import type { DexSwapper, DexType, DexConfig, Quote, SwapResult } from './types';
import { DEX_INFO } from './types';
import type { ChainId } from '@trenchtools/core';
import { isEvmChain } from '@trenchtools/core';

// Re-export individual swappers
export { jupiterSwapper, getHeliusPriorityFee } from './jupiter';
export { raydiumSwapper } from './raydium';
export { meteoraSwapper } from './meteora';
export { pumpfunSwapper } from './pumpfun';
export { openoceanSwapper, executeEvmSwap, getOpenOceanSwapCalldata, getOpenOceanApprovalTx } from './openocean';

/**
 * Registry of all DEX swappers
 */
export const DEX_SWAPPERS: Record<DexType, DexSwapper> = {
  jupiter: jupiterSwapper,
  raydium: raydiumSwapper,
  meteora: meteoraSwapper,
  pumpfun: pumpfunSwapper,
  openocean: openoceanSwapper,
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
 * Get the default DEX type for a given chain.
 * - Solana → 'jupiter'
 * - BSC / Base → 'openocean'
 */
export function getDefaultDexForChain(chain: ChainId): DexType {
  if (isEvmChain(chain)) return 'openocean';
  return 'jupiter';
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
 * Get a quote using the default DEX for the given chain.
 */
export async function getChainQuote(
  chain: ChainId,
  inputMint: string,
  outputMint: string,
  amount: number,
  config: DexConfig,
): Promise<Quote> {
  const dex = getDefaultDexForChain(chain);
  return getQuote(dex, inputMint, outputMint, amount, { ...config, chain });
}

/**
 * Execute swap on a specific DEX (Solana only — use executeEvmSwap for EVM chains)
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
 * Get implemented DEXs for a specific chain
 */
export function getImplementedDexesForChain(chain: ChainId): DexType[] {
  if (isEvmChain(chain)) return ['openocean'];
  return ['jupiter', 'pumpfun'];
}

/**
 * Check if a DEX is implemented
 */
export function isDexImplemented(dexType: DexType): boolean {
  return DEX_SWAPPERS[dexType]?.isImplemented ?? false;
}

/**
 * Default DEX to use (Solana)
 */
export const DEFAULT_DEX: DexType = 'jupiter';
