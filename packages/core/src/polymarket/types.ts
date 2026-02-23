/**
 * Polymarket prediction market types and contract addresses.
 */

// ── Market Types (from Gamma API) ──

export interface PolymarketMarket {
  conditionId: string;
  questionId?: string;
  slug?: string;
  question: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  closed?: boolean;
  liquidity: number;
  volume: number;
  outcomes: string[];
  outcomePrices: string[];
  tokens: PolymarketToken[];
  image?: string;
  icon?: string;
  category?: string;
  negRisk?: boolean;
}

export interface PolymarketToken {
  token_id: string;
  outcome: string;
  price: number;
  winner?: boolean;
}

// ── Position Types ──

export interface PolymarketPosition {
  conditionId: string;
  tokenId: string;
  outcome: string;
  question: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  resolved?: boolean;
}

// ── Order Types ──

export type PolymarketOrderSide = 'BUY' | 'SELL';

export interface PolymarketOrderParams {
  tokenId: string;
  side: PolymarketOrderSide;
  /** Price per share (0.01–0.99) */
  price: number;
  /** Number of shares */
  size: number;
  /** If true, use FOK market order. Default: GTC limit order. */
  isMarketOrder?: boolean;
}

export interface PolymarketOrderResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  filledSize?: number;
  avgPrice?: number;
  error?: string;
}

// ── Whale Alert Types ──

export interface PolymarketWhaleAlert {
  id: string;
  timestamp: number;
  market: string;
  conditionId: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  usdValue: number;
  maker: string;
}

// ── Contract Addresses (Polygon) ──

export const POLYMARKET_CONTRACTS = {
  /** CTF Exchange — order submission + token approval target */
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  /** Neg-risk CTF Exchange */
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  /** Conditional Token Framework — position tokens + redemption */
  CTF_TOKEN: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  /** Bridged USDC (USDC.e) on Polygon — 6 decimals */
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  /** Polygon chain ID */
  CHAIN_ID: 137,
} as const;

// ── API URLs ──

export const POLYMARKET_APIS = {
  GAMMA: 'https://gamma-api.polymarket.com',
  CLOB: 'https://clob.polymarket.com',
  DATA: 'https://data-api.polymarket.com',
  WS: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
} as const;
