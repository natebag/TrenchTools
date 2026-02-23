/**
 * Polymarket Gamma API client — market search + discovery.
 * No authentication required. CORS-enabled for browser use.
 */

import type { PolymarketMarket } from './types.js';
import { POLYMARKET_APIS } from './types.js';

export interface GammaSearchParams {
  query?: string;
  active?: boolean;
  closed?: boolean;
  limit?: number;
  offset?: number;
  order?: 'volume' | 'liquidity' | 'startDate' | 'endDate';
}

/** Search markets via Gamma API */
export async function searchMarkets(params: GammaSearchParams = {}): Promise<PolymarketMarket[]> {
  const url = new URL(`${POLYMARKET_APIS.GAMMA}/markets`);
  if (params.query) url.searchParams.set('_q', params.query);
  if (params.active !== undefined) url.searchParams.set('active', String(params.active));
  if (params.closed !== undefined) url.searchParams.set('closed', String(params.closed));
  url.searchParams.set('_limit', String(params.limit ?? 10));
  if (params.offset) url.searchParams.set('_offset', String(params.offset));
  if (params.order) url.searchParams.set('_order', params.order);

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Gamma API error: ${resp.status}`);
  const raw = await resp.json() as any[];

  return raw.map(normalizeMarket);
}

/** Get a single market by condition ID */
export async function getMarket(conditionId: string): Promise<PolymarketMarket | null> {
  const resp = await fetch(`${POLYMARKET_APIS.GAMMA}/markets/${conditionId}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Gamma API error: ${resp.status}`);
  const raw = await resp.json();
  return normalizeMarket(raw);
}

/** Get trending markets sorted by volume */
export async function getTrendingMarkets(limit = 10): Promise<PolymarketMarket[]> {
  return searchMarkets({ active: true, closed: false, order: 'volume', limit });
}

/** Normalize Gamma API response to our type */
function normalizeMarket(raw: any): PolymarketMarket {
  const outcomes = raw.outcomes ? (typeof raw.outcomes === 'string' ? JSON.parse(raw.outcomes) : raw.outcomes) : ['Yes', 'No'];
  const outcomePrices = raw.outcomePrices ? (typeof raw.outcomePrices === 'string' ? JSON.parse(raw.outcomePrices) : raw.outcomePrices) : ['0.5', '0.5'];

  const tokens: PolymarketMarket['tokens'] = [];
  if (raw.tokens) {
    const rawTokens = typeof raw.tokens === 'string' ? JSON.parse(raw.tokens) : raw.tokens;
    for (const t of rawTokens) {
      tokens.push({
        token_id: t.token_id,
        outcome: t.outcome,
        price: parseFloat(outcomePrices[outcomes.indexOf(t.outcome)] ?? '0.5'),
        winner: t.winner,
      });
    }
  } else {
    // Build tokens from outcomes if not provided
    for (let i = 0; i < outcomes.length; i++) {
      tokens.push({
        token_id: raw.clobTokenIds?.[i] ?? '',
        outcome: outcomes[i],
        price: parseFloat(outcomePrices[i] ?? '0.5'),
      });
    }
  }

  return {
    conditionId: raw.conditionId || raw.condition_id || raw.id || '',
    questionId: raw.questionId,
    slug: raw.slug,
    question: raw.question || '',
    description: raw.description,
    startDate: raw.startDate || raw.start_date_iso,
    endDate: raw.endDate || raw.end_date_iso,
    active: raw.active ?? true,
    closed: raw.closed ?? false,
    liquidity: parseFloat(raw.liquidity ?? '0'),
    volume: parseFloat(raw.volume ?? '0'),
    outcomes,
    outcomePrices,
    tokens,
    image: raw.image,
    icon: raw.icon,
    category: raw.category,
    negRisk: raw.negRisk,
  };
}
