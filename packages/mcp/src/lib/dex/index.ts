export * from './types.js';
import { jupiterSwapper, getHeliusPriorityFee } from './jupiter.js';
import { pumpfunSwapper, getBondingCurveAddress } from './pumpfun.js';
import type { DexSwapper, DexType, DexConfig, Quote, SwapResult } from './types.js';
import { Connection, PublicKey } from '@solana/web3.js';

export { jupiterSwapper, getHeliusPriorityFee } from './jupiter.js';
export { pumpfunSwapper, getBondingCurveAddress } from './pumpfun.js';

export const DEX_SWAPPERS: Record<DexType, DexSwapper> = {
  jupiter: jupiterSwapper,
  pumpfun: pumpfunSwapper,
};

export function getSwapper(dexType: DexType): DexSwapper {
  const swapper = DEX_SWAPPERS[dexType];
  if (!swapper) throw new Error(`Unknown DEX type: ${dexType}`);
  return swapper;
}

export async function getQuote(dexType: DexType, inputMint: string, outputMint: string, amount: number, config: DexConfig): Promise<Quote> {
  return getSwapper(dexType).getQuote(inputMint, outputMint, amount, config);
}

export async function executeSwap(quote: Quote, wallet: import('@solana/web3.js').Keypair, config: DexConfig): Promise<SwapResult> {
  return getSwapper(quote.dex).executeSwap(quote, wallet, config);
}

/**
 * Auto-detect whether a token is on PumpFun bonding curve or graduated to Jupiter.
 * Returns 'pumpfun' if active bonding curve, 'jupiter' otherwise.
 */
export async function detectDex(tokenMint: string, rpcUrl: string): Promise<DexType> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const mint = new PublicKey(tokenMint);
    const bondingCurve = getBondingCurveAddress(mint);
    const accountInfo = await connection.getAccountInfo(bondingCurve);
    if (accountInfo && accountInfo.data) {
      const complete = (accountInfo.data as Buffer).readUInt8(48) === 1;
      if (!complete) return 'pumpfun';
    }
  } catch { /* fall through to jupiter */ }
  return 'jupiter';
}
