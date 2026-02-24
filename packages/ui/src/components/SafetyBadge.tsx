import { useEffect, useRef, useState, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { Connection } from '@solana/web3.js';
import { useNetwork } from '@/context/NetworkContext';
import type { TokenSafetyScore } from '@trenchtools/core';

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
const CACHE_KEY_PREFIX = 'trench_shield_cache_';
const CACHE_TTL = 5 * 60 * 1000;

function getScoreClasses(score: number) {
  if (score >= 80) return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' };
  if (score >= 50) return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' };
  return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' };
}

interface SafetyBadgeProps {
  tokenMint: string;
  compact?: boolean;
}

export function SafetyBadge({ tokenMint, compact = true }: SafetyBadgeProps) {
  const { rpcUrl } = useNetwork();
  const [result, setResult] = useState<TokenSafetyScore | null>(null);
  const [loading, setLoading] = useState(false);
  const lastScanned = useRef('');

  const scan = useCallback(async (mint: string) => {
    setLoading(true);
    setResult(null);

    // Check cache
    try {
      const cached = localStorage.getItem(CACHE_KEY_PREFIX + mint);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          setResult(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    try {
      let data: TokenSafetyScore;
      if (IS_HOSTED) {
        const resp = await fetch('/api/shield/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenMint: mint }),
        });
        if (!resp.ok) throw new Error('scan failed');
        data = await resp.json();
      } else {
        const { analyzeTokenSafety } = await import('@trenchtools/core');
        const connection = new Connection(rpcUrl, 'confirmed');
        data = await analyzeTokenSafety({ connection, tokenMint: mint });
      }

      try {
        localStorage.setItem(CACHE_KEY_PREFIX + mint, JSON.stringify({ data, timestamp: Date.now() }));
      } catch {}

      setResult(data);
    } catch {
      // Silently fail — badge just won't show
    } finally {
      setLoading(false);
    }
  }, [rpcUrl]);

  useEffect(() => {
    const trimmed = tokenMint.trim();
    if (
      trimmed.length >= 32 && trimmed.length <= 44 &&
      /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed) &&
      trimmed !== lastScanned.current
    ) {
      const timer = setTimeout(() => {
        lastScanned.current = trimmed;
        scan(trimmed);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tokenMint, scan]);

  if (!result && !loading) return null;

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 border border-gray-700">
        <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400">Scanning...</span>
      </span>
    );
  }

  if (!result) return null;

  const score = result.scores.overall;
  const cls = getScoreClasses(score);
  const label = result.isHoneypot ? 'HONEYPOT' : result.isSafe ? 'Safe' : 'Caution';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${cls.bg} ${cls.border}`}
      title={`Shield Score: ${score}/100 — ${label}${result.holderAnalysis ? ` | Top 10: ${result.holderAnalysis.top10Concentration.toFixed(0)}%` : ''}`}
    >
      <Shield className={`w-3.5 h-3.5 ${cls.text}`} />
      <span className={`text-xs font-bold ${cls.text}`}>{score}</span>
      {!compact && <span className={`text-xs ${cls.text}`}>{label}</span>}
    </span>
  );
}
