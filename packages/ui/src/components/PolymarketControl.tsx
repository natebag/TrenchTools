/**
 * PolymarketControl - Prediction Market Trading via Polymarket
 * TrenchSniper OS
 *
 * Tabs: Markets (search + trending), Trade (buy/sell shares), Positions (open + resolved).
 * In hosted mode, market search proxies through /api/polymarket.
 * In self-hosted mode, calls Gamma API directly via @trenchtools/core.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  X,
  DollarSign,
  BarChart3,
  Clock,
  Flame,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
} from 'lucide-react';
import type {
  PolymarketMarket,
  PolymarketPosition,
} from '@trenchtools/core';

// ============ Constants ============

const IS_HOSTED = import.meta.env.VITE_HOSTED === 'true';
const API_BASE = IS_HOSTED ? '/api' : '';

type Tab = 'markets' | 'trade' | 'positions';

const AMOUNT_PRESETS = [5, 10, 25, 50];

// ============ Helpers ============

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

function formatLiquidity(liq: number): string {
  if (liq >= 1_000_000) return `$${(liq / 1_000_000).toFixed(1)}M`;
  if (liq >= 1_000) return `$${(liq / 1_000).toFixed(0)}K`;
  return `$${liq.toFixed(0)}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function outcomeColor(outcome: string): string {
  const lower = outcome.toLowerCase();
  if (lower === 'yes') return 'text-emerald-400';
  if (lower === 'no') return 'text-red-400';
  return 'text-blue-400';
}

// ============ API Functions ============

async function fetchMarkets(query?: string, limit = 10): Promise<PolymarketMarket[]> {
  if (IS_HOSTED) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(limit));
    const resp = await fetch(`${API_BASE}/polymarket/markets?${params}`);
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    return data.markets || [];
  }

  // Self-hosted: call core directly
  const { searchMarkets, getTrendingMarkets } = await import('@trenchtools/core');
  if (query) {
    return searchMarkets({ query, limit, active: true });
  }
  return getTrendingMarkets(limit);
}

// ============ Sub-Components ============

function SkeletonCard() {
  return (
    <div className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/50 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-700 rounded w-1/2 mb-4" />
      <div className="flex gap-2 mb-3">
        <div className="h-6 bg-gray-700 rounded-full w-20" />
        <div className="h-6 bg-gray-700 rounded-full w-20" />
      </div>
      <div className="h-2 bg-gray-700 rounded w-full mb-2" />
      <div className="flex justify-between">
        <div className="h-3 bg-gray-700 rounded w-16" />
        <div className="h-3 bg-gray-700 rounded w-16" />
      </div>
    </div>
  );
}

function MarketCard({
  market,
  onSelect,
}: {
  market: PolymarketMarket;
  onSelect: (m: PolymarketMarket) => void;
}) {
  const yesToken = market.tokens.find(t => t.outcome.toLowerCase() === 'yes');
  const noToken = market.tokens.find(t => t.outcome.toLowerCase() === 'no');
  const yesPrice = yesToken?.price ?? 0.5;
  const noPrice = noToken?.price ?? 0.5;
  const yesPct = Math.round(yesPrice * 100);

  return (
    <button
      onClick={() => onSelect(market)}
      className="w-full text-left bg-gray-800/60 hover:bg-gray-800 rounded-lg p-4 border border-gray-700/50 hover:border-gray-600 transition-all group"
    >
      {/* Question */}
      <div className="flex items-start gap-3 mb-3">
        {market.image && (
          <img
            src={market.image}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mt-0.5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug flex-1">
          {market.question}
        </p>
        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 flex-shrink-0 mt-0.5 transition-colors" />
      </div>

      {/* Outcome Prices */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400">
          YES {yesPct}c
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400">
          NO {Math.round(noPrice * 100)}c
        </span>
      </div>

      {/* Probability Bar */}
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
          style={{ width: `${yesPct}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            {formatVolume(market.volume)}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {formatLiquidity(market.liquidity)}
          </span>
        </div>
        {market.endDate && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(market.endDate)}
          </span>
        )}
      </div>
    </button>
  );
}

// ============ Markets Tab ============

function MarketsTab({
  onSelectMarket,
}: {
  onSelectMarket: (m: PolymarketMarket) => void;
}) {
  const [query, setQuery] = useState('');
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending on mount
  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    setIsLoading(true);
    setError(null);
    setQuery('');
    try {
      const result = await fetchMarkets(undefined, 12);
      setMarkets(result);
      setHasSearched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      loadTrending();
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const result = await fetchMarkets(q.trim(), 12);
      setMarkets(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearch(value), 400);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search prediction markets..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); loadTrending(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={loadTrending}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 transition-colors disabled:opacity-50"
        >
          <Flame className="w-4 h-4" />
          Trending
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Section Label */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-gray-400">
          {hasSearched ? `Results for "${query}"` : 'Trending Markets'}
        </h3>
        <span className="text-xs text-gray-600">
          {!isLoading && `${markets.length} market${markets.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Market Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{hasSearched ? 'No markets found for that search.' : 'No trending markets available.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.conditionId} market={m} onSelect={onSelectMarket} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Trade Tab ============

function TradeTab({
  market,
  onBack,
}: {
  market: PolymarketMarket;
  onBack: () => void;
}) {
  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No'>('Yes');
  const [amount, setAmount] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const yesToken = market.tokens.find(t => t.outcome.toLowerCase() === 'yes');
  const noToken = market.tokens.find(t => t.outcome.toLowerCase() === 'no');
  const selectedToken = selectedOutcome === 'Yes' ? yesToken : noToken;
  const price = selectedToken?.price ?? 0.5;
  const amountNum = parseFloat(amount) || 0;
  const estimatedShares = amountNum > 0 ? amountNum / price : 0;
  const potentialPayout = estimatedShares * 1.0; // $1 per winning share

  const handleExecute = async () => {
    if (!amount || amountNum <= 0) return;

    setIsExecuting(true);
    setResult(null);

    try {
      // TODO: Integrate with vault for actual trading
      // For hosted mode: POST /api/polymarket/buy
      // For self-hosted: call approveUsdc() + placeOrder() from @trenchtools/core
      setResult({
        success: false,
        message: 'Trading not yet connected. Vault integration needed for Polygon wallet access.',
      });
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Order failed',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to Markets
      </button>

      {/* Market Detail Card */}
      <div className="bg-gray-800/60 rounded-lg p-5 border border-gray-700/50">
        <div className="flex items-start gap-3 mb-4">
          {market.image && (
            <img
              src={market.image}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white leading-snug mb-1">
              {market.question}
            </h2>
            {market.description && (
              <p className="text-sm text-gray-400 line-clamp-3">{market.description}</p>
            )}
          </div>
        </div>

        {/* Outcome Prices */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {market.tokens.map((token) => {
            const pct = Math.round(token.price * 100);
            return (
              <div
                key={token.token_id}
                className={`rounded-lg p-3 border ${
                  token.outcome.toLowerCase() === 'yes'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <p className={`text-xs font-medium ${outcomeColor(token.outcome)}`}>
                  {token.outcome}
                </p>
                <p className={`text-2xl font-bold ${outcomeColor(token.outcome)}`}>
                  {pct}c
                </p>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            Vol: {formatVolume(market.volume)}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Liq: {formatLiquidity(market.liquidity)}
          </span>
          {market.endDate && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Ends: {formatDate(market.endDate)}
            </span>
          )}
          <a
            href={`https://polymarket.com/event/${market.slug || market.conditionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-purple-400 hover:text-purple-300 ml-auto"
          >
            Polymarket
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Trade Form */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-sm font-semibold text-white mb-4">Place Order</h3>

        {/* Outcome Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSelectedOutcome('Yes')}
            className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
              selectedOutcome === 'Yes'
                ? 'bg-emerald-500/20 border-2 border-emerald-500/60 text-emerald-400'
                : 'bg-gray-900 border-2 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 inline mr-1" />
            Buy YES @ {Math.round((yesToken?.price ?? 0.5) * 100)}c
          </button>
          <button
            onClick={() => setSelectedOutcome('No')}
            className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
              selectedOutcome === 'No'
                ? 'bg-red-500/20 border-2 border-red-500/60 text-red-400'
                : 'bg-gray-900 border-2 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <ArrowDownRight className="w-4 h-4 inline mr-1" />
            Buy NO @ {Math.round((noToken?.price ?? 0.5) * 100)}c
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Amount (USDC)
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={isExecuting}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-9 pr-4 py-3 text-white text-sm focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            {AMOUNT_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                disabled={isExecuting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
              >
                ${preset}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate */}
        {amountNum > 0 && (
          <div className="bg-gray-900 rounded-lg p-3 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Price per share</span>
              <span className="text-white">{Math.round(price * 100)}c</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Estimated shares</span>
              <span className="text-white">{estimatedShares.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-800 pt-2">
              <span className="text-gray-400">Potential payout (if win)</span>
              <span className="text-emerald-400 font-semibold">
                ${potentialPayout.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Potential profit</span>
              <span className="text-emerald-400 font-semibold">
                +${(potentialPayout - amountNum).toFixed(2)} ({((potentialPayout / amountNum - 1) * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={!amount || amountNum <= 0 || isExecuting}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            selectedOutcome === 'Yes'
              ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400'
              : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 text-red-400'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Placing Order...
            </>
          ) : (
            <>
              Buy {selectedOutcome} @ {Math.round(price * 100)}c
            </>
          )}
        </button>

        {/* Result */}
        {result && (
          <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${
            result.success
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
          }`}>
            {result.success ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{result.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Positions Tab ============

function PositionsTab() {
  const [positions, _setPositions] = useState<PolymarketPosition[]>([]);
  const [isLoading, _setIsLoading] = useState(false);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Load positions when vault integration is ready
    // For hosted: GET /api/polymarket/positions?walletIndex=0
    // For self-hosted: getPositions(privateKeyHex)
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        <span className="ml-2 text-gray-400">Loading positions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <span className="text-red-400 text-sm">{error}</span>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <BarChart3 className="w-8 h-8 text-gray-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-400 mb-1">No Positions</h3>
        <p className="text-sm text-gray-600 max-w-sm mx-auto">
          Your prediction market positions will appear here once you start trading.
          Vault integration with Polygon wallet is required.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Market</th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">Outcome</th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">Shares</th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">Avg Price</th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">Current</th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">P&L</th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const pnlPositive = pos.pnl >= 0;
            return (
              <tr
                key={`${pos.conditionId}-${pos.tokenId}`}
                className="border-b border-gray-700/50 hover:bg-gray-700/30"
              >
                <td className="py-3 px-3 max-w-[200px]">
                  <p className="text-white text-xs truncate">{pos.question}</p>
                </td>
                <td className="py-3 px-3">
                  <span className={`text-xs font-bold ${outcomeColor(pos.outcome)}`}>
                    {pos.outcome}
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-gray-300 font-mono text-xs">{pos.size.toFixed(2)}</span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-gray-300 font-mono text-xs">{Math.round(pos.avgPrice * 100)}c</span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className="text-gray-300 font-mono text-xs">{Math.round(pos.currentPrice * 100)}c</span>
                </td>
                <td className="py-3 px-3 text-right">
                  <span className={`text-xs font-bold ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pnlPositive ? '+' : ''}${pos.pnl.toFixed(2)}
                    <span className="text-gray-500 ml-1">
                      ({pnlPositive ? '+' : ''}{pos.pnlPercent.toFixed(1)}%)
                    </span>
                  </span>
                </td>
                <td className="py-3 px-3 text-right">
                  {pos.resolved ? (
                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-400 transition-colors">
                      <Trophy className="w-3 h-3 inline mr-1" />
                      Claim
                    </button>
                  ) : (
                    <button className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-colors">
                      Sell
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ Main Component ============

export function PolymarketControl() {
  const [activeTab, setActiveTab] = useState<Tab>('markets');
  const [selectedMarket, setSelectedMarket] = useState<PolymarketMarket | null>(null);

  const handleSelectMarket = (market: PolymarketMarket) => {
    setSelectedMarket(market);
    setActiveTab('trade');
  };

  const handleBackToMarkets = () => {
    setSelectedMarket(null);
    setActiveTab('markets');
  };

  const tabs: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'markets', label: 'Markets', icon: Search },
    { id: 'trade', label: 'Trade', icon: TrendingUp },
    { id: 'positions', label: 'Positions', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-purple-400" />
          Polymarket
        </h1>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400">
            Polygon
          </span>
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            polymarket.com
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = tab.id === 'trade' && !selectedMarket;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? 'bg-purple-500/20 text-purple-400'
                  : isDisabled
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === 'trade' && selectedMarket && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'markets' && (
        <MarketsTab onSelectMarket={handleSelectMarket} />
      )}
      {activeTab === 'trade' && selectedMarket && (
        <TradeTab market={selectedMarket} onBack={handleBackToMarkets} />
      )}
      {activeTab === 'positions' && (
        <PositionsTab />
      )}
    </div>
  );
}
