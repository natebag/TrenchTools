/**
 * CAIP-2 / CAIP-10 helpers for Printr API integration.
 *
 * CAIP-2 = chain identifier  (e.g. "eip155:56")
 * CAIP-10 = account identifier (e.g. "eip155:56:0xabc...")
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-10.md
 */

import { CHAINS, type ChainId } from './types.js';

/**
 * Convert a ChainId to its CAIP-2 identifier.
 *
 * @example toCaip2('solana') → "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
 * @example toCaip2('bsc')    → "eip155:56"
 * @example toCaip2('base')   → "eip155:8453"
 */
export function toCaip2(chain: ChainId): string {
  return CHAINS[chain].caip2;
}

/**
 * Convert a ChainId + wallet address to a CAIP-10 account identifier.
 *
 * @example toCaip10('bsc', '0xabc...')  → "eip155:56:0xabc..."
 * @example toCaip10('solana', 'ABC...') → "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:ABC..."
 */
export function toCaip10(chain: ChainId, address: string): string {
  return `${CHAINS[chain].caip2}:${address}`;
}

/**
 * Parse a CAIP-2 string back to a ChainId, or undefined if not recognised.
 *
 * @example fromCaip2('eip155:56') → 'bsc'
 */
export function fromCaip2(caip2: string): ChainId | undefined {
  for (const [id, cfg] of Object.entries(CHAINS)) {
    if (cfg.caip2 === caip2) return id as ChainId;
  }
  return undefined;
}

/**
 * Parse a CAIP-10 string and return { chain, address }, or undefined.
 */
export function fromCaip10(caip10: string): { chain: ChainId; address: string } | undefined {
  for (const [id, cfg] of Object.entries(CHAINS)) {
    if (caip10.startsWith(cfg.caip2 + ':')) {
      return {
        chain: id as ChainId,
        address: caip10.slice(cfg.caip2.length + 1),
      };
    }
  }
  return undefined;
}
