/**
 * ChangeNow currency pair mappings per chain.
 *
 * Used by stealth-funding to pick the right from→to tickers
 * when funding wallets via ChangeNow's non-custodial swap.
 */

import type { ChainId } from './types.js';

export interface ChangeNowPair {
  /** ChangeNow "from" ticker (e.g. 'usdcsol') */
  from: string;
  /** ChangeNow "to" ticker (e.g. 'sol') */
  to: string;
  /** Optional network hint for ChangeNow */
  network?: string;
}

export const CHANGENOW_PAIRS: Record<ChainId, ChangeNowPair> = {
  solana: { from: 'usdcsol', to: 'sol' },
  bsc:    { from: 'usdcbsc', to: 'bnb' },
  base:   { from: 'usdcbase', to: 'eth', network: 'base' },
  sui:    { from: 'usdc', to: 'sui' }, // placeholder — verify when SUI goes live
};
