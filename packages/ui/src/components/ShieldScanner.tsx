/**
 * ShieldScanner -- Token safety analysis UI
 * TrenchSniper OS
 *
 * Scans any Solana token for honeypot indicators, authority risks,
 * liquidity health, holder concentration, and PumpFun bonding curve status.
 */

import { useState } from 'react';
import {
  Shield,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';
import { useShieldScan } from '@/hooks/useShieldScan';
import type { TokenSafetyScore, RiskFinding } from '@trenchtools/core';

// ── Color helpers (static Tailwind classes only) ─────────────────────────────

interface ScoreColors {
  text: string;
  bg: string;
  border: string;
  bar: string;
  label: string;
}

function getScoreColors(score: number): ScoreColors {
  if (score >= 80) {
    return {
      text: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      bar: 'bg-emerald-500',
      label: 'SAFE TO TRADE',
    };
  }
  if (score >= 50) {
    return {
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      bar: 'bg-amber-500',
      label: 'CAUTION',
    };
  }
  return {
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    bar: 'bg-red-500',
    label: 'HONEYPOT DETECTED',
  };
}

function getBarColorClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getSeverityIcon(severity: RiskFinding['severity']) {
  switch (severity) {
    case 'critical':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'high':
      return <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />;
    case 'medium':
      return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    case 'low':
      return <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />;
    case 'safe':
      return <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-red-400 text-sm font-medium">{w}</span>
        </div>
      ))}
    </div>
  );
}

function ScoreOverview({ result }: { result: TokenSafetyScore }) {
  const overall = result.scores.overall;
  const colors = getScoreColors(overall);

  return (
    <div className={`rounded-lg p-6 border ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center justify-center min-w-[80px]">
          <span className={`text-4xl font-bold font-mono ${colors.text}`}>
            {overall}
          </span>
          <span className="text-xs text-gray-400 mt-1">/100</span>
        </div>

        <div className="flex-1">
          <h2 className={`text-xl font-bold ${colors.text}`}>
            {colors.label}
          </h2>
          {(result.tokenName || result.tokenSymbol) && (
            <p className="text-gray-400 text-sm mt-1">
              {result.tokenName}
              {result.tokenSymbol ? ` (${result.tokenSymbol})` : ''}
            </p>
          )}
          <p className="text-gray-500 text-xs mt-1 font-mono">
            {result.tokenMint}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
          <span>
            {result.totalFindings} finding{result.totalFindings !== 1 ? 's' : ''}
          </span>
          {result.criticalFindings > 0 && (
            <span className="text-red-400 font-medium">
              {result.criticalFindings} critical
            </span>
          )}
          {result.highFindings > 0 && (
            <span className="text-orange-400 font-medium">
              {result.highFindings} high
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryBreakdown({ scores }: { scores: TokenSafetyScore['scores'] }) {
  const categories: { key: keyof Omit<typeof scores, 'overall'>; label: string }[] = [
    { key: 'mintAuthority', label: 'Mint Authority' },
    { key: 'freezeAuthority', label: 'Freeze Authority' },
    { key: 'liquidity', label: 'Liquidity' },
    { key: 'ownership', label: 'Ownership' },
    { key: 'transfers', label: 'Transfers' },
    { key: 'developer', label: 'Developer' },
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
        Category Breakdown
      </h3>
      <div className="space-y-3">
        {categories.map(({ key, label }) => {
          const value = scores[key];
          const barColor = getBarColorClass(value);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-300">{label}</span>
                <span className="text-sm text-gray-400 font-mono">
                  {value}/100
                </span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FindingsList({ findings }: { findings: RiskFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
          Findings
        </h3>
        <div className="text-center py-4 text-gray-500">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No risk findings detected.</p>
        </div>
      </div>
    );
  }

  // Sort: critical first, then high, medium, low, safe
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    safe: 4,
  };
  const sorted = [...findings].sort(
    (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5),
  );

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
        Findings ({findings.length})
      </h3>
      <div className="space-y-2">
        {sorted.map((finding) => (
          <div
            key={finding.id}
            className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg"
          >
            <div className="mt-0.5">{getSeverityIcon(finding.severity)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">{finding.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{finding.description}</p>
            </div>
            <span className="text-xs text-gray-500 uppercase flex-shrink-0">
              {finding.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PumpFunBadge({
  status,
}: {
  status: NonNullable<TokenSafetyScore['pumpFunStatus']>;
}) {
  if (!status.isPumpFun) return null;

  if (status.isGraduated) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
        <span className="text-lg">&#127891;</span>
        <span className="text-sm text-emerald-400 font-medium">
          Graduated -- Trading on DEX
        </span>
      </div>
    );
  }

  const progress = status.progress ?? 0;
  return (
    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">&#129514;</span>
        <span className="text-sm text-purple-400 font-medium">
          Bonding Curve -- {progress.toFixed(1)}% to graduation
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-all duration-500"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}

function HolderConcentration({
  analysis,
}: {
  analysis: NonNullable<TokenSafetyScore['holderAnalysis']>;
}) {
  const pct = analysis.top10Concentration.toFixed(1);
  const isConcentrated = analysis.isConcentrated;

  return (
    <div
      className={`rounded-lg px-4 py-3 border ${
        isConcentrated
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-gray-800 border-gray-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConcentrated ? (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          )}
          <span className="text-sm text-gray-300">Top 10 Holders</span>
        </div>
        <span
          className={`text-sm font-mono font-medium ${
            isConcentrated ? 'text-amber-400' : 'text-emerald-400'
          }`}
        >
          {pct}%
        </span>
      </div>
      {isConcentrated && (
        <p className="text-xs text-amber-400/70 mt-1 ml-6">
          High concentration (&gt;50%) -- watch for dumps
        </p>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ShieldScanner() {
  const [tokenAddress, setTokenAddress] = useState('');
  const { result, loading, error, scan, clearResult } = useShieldScan();

  const handleScan = () => {
    const trimmed = tokenAddress.trim();
    if (!trimmed) return;
    scan(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleScan();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-emerald-500" />
        <h1 className="text-2xl font-bold text-white">Shield Scanner</h1>
      </div>

      {/* Input */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex gap-3">
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter token address to scan..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
          />
          <button
            onClick={handleScan}
            disabled={loading || !tokenAddress.trim()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Scan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
          <button
            onClick={clearResult}
            className="ml-auto text-gray-400 hover:text-white text-lg leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !result && (
        <div className="space-y-4 animate-pulse">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center gap-4">
              <div className="w-20 h-14 bg-gray-700 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-700 rounded w-1/3" />
                <div className="h-3 bg-gray-700 rounded w-2/3" />
              </div>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 bg-gray-700 rounded w-1/4" />
                  <div className="h-2 bg-gray-700 rounded w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Warnings */}
          <WarningsPanel warnings={result.warnings} />

          {/* Overall score */}
          <ScoreOverview result={result} />

          {/* PumpFun badge */}
          {result.pumpFunStatus?.isPumpFun && (
            <PumpFunBadge status={result.pumpFunStatus} />
          )}

          {/* Holder concentration */}
          {result.holderAnalysis && (
            <HolderConcentration analysis={result.holderAnalysis} />
          )}

          {/* Category bars */}
          <CategoryBreakdown scores={result.scores} />

          {/* Risk findings */}
          <FindingsList findings={result.findings} />
        </div>
      )}
    </div>
  );
}
