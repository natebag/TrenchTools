/**
 * useShieldScan -- React hook for token safety scanning.
 *
 * Self-hosted: imports analyzeTokenSafety from @trenchtools/core and runs
 *              the full on-chain + DexScreener analysis locally.
 * Hosted:      POSTs to /api/shield/scan and returns the server result.
 *
 * Results are cached in localStorage for 5 minutes per token mint.
 */

import { useState, useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { useNetwork } from '@/context/NetworkContext';
import type { TokenSafetyScore } from '@trenchtools/core';

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
const CACHE_KEY_PREFIX = 'trench_shield_cache_';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useShieldScan() {
  const { rpcUrl } = useNetwork();
  const [result, setResult] = useState<TokenSafetyScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (tokenMint: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    // Check localStorage cache
    const cacheKey = CACHE_KEY_PREFIX + tokenMint;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setResult(data);
          setLoading(false);
          return data;
        }
      }
    } catch {
      // Ignore corrupt cache entries
    }

    try {
      let scanResult: TokenSafetyScore;

      if (IS_HOSTED) {
        const resp = await fetch('/api/shield/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenMint }),
        });
        if (!resp.ok) throw new Error(`Scan failed: ${resp.status}`);
        scanResult = await resp.json();
      } else {
        const { analyzeTokenSafety } = await import('@trenchtools/core');
        const connection = new Connection(rpcUrl, 'confirmed');
        scanResult = await analyzeTokenSafety({ connection, tokenMint });
      }

      // Cache result
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ data: scanResult, timestamp: Date.now() }),
        );
      } catch {
        // localStorage full or unavailable -- ignore
      }

      setResult(scanResult);
      setLoading(false);
      return scanResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      setError(message);
      setLoading(false);
      return null;
    }
  }, [rpcUrl]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, scan, clearResult };
}
