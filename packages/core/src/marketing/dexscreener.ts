/**
 * DexScreener Integration
 * Monitor token presence and fetch market data
 * 
 * Note: DexScreener auto-indexes tokens. "Update" typically requires:
 * 1. Token profile submission (via their UI/form)
 * 2. Paid promotion/boosts
 * 3. Community engagement
 * 
 * This module provides monitoring and data fetching.
 */

const DEXSCREENER_API = 'https://api.dexscreener.com/latest';
const DEXSCREENER_FRONTEND = 'https://dexscreener.com';

interface DexScreenerApiResponse {
  pairs?: TokenPair[];
  schemaVersion?: string;
  pair?: TokenPair;
}

export interface DexScreenerConfig {
  chainId: string; // 'solana'
  tokenAddress: string;
  pollIntervalMs?: number;
}

export interface TokenPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidityUsd: number;
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

export interface TokenProfile {
  url: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: {
    type: string;
    label: string;
    url: string;
  }[];
}

export interface DexScreenerStatus {
  listed: boolean;
  pairs: TokenPair[];
  profile?: TokenProfile;
  lastChecked: number;
}

export interface ListingCheck {
  isListed: boolean;
  pairCount: number;
  timeToListMinutes?: number;
  earliestPairCreatedAt?: number;
  topPair?: TokenPair;
}

/**
 * Check if token is listed on DexScreener
 */
export async function checkListing(
  chainId: string,
  tokenAddress: string
): Promise<ListingCheck> {
  try {
    const response = await fetch(
      `${DEXSCREENER_API}/dex/tokens/${chainId}/${tokenAddress}`
    );

    if (!response.ok) {
      return {
        isListed: false,
        pairCount: 0,
      };
    }

    const data = await response.json() as DexScreenerApiResponse;
    const pairs: TokenPair[] = data.pairs || [];

    if (pairs.length === 0) {
      return {
        isListed: false,
        pairCount: 0,
      };
    }

    // Find earliest pair
    const earliest = pairs.reduce((min, p) =>
      p.pairCreatedAt < min.pairCreatedAt ? p : min
    );

    return {
      isListed: true,
      pairCount: pairs.length,
      earliestPairCreatedAt: earliest.pairCreatedAt,
      topPair: pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0],
    };
  } catch (error) {
    return {
      isListed: false,
      pairCount: 0,
    };
  }
}

/**
 * Get token pairs and market data
 */
export async function getTokenData(
  chainId: string,
  tokenAddress: string
): Promise<DexScreenerStatus> {
  const response = await fetch(
    `${DEXSCREENER_API}/dex/tokens/${chainId}/${tokenAddress}`
  );

  if (!response.ok) {
    return {
      listed: false,
      pairs: [],
      lastChecked: Date.now(),
    };
  }

  const data = await response.json() as DexScreenerApiResponse;

  return {
    listed: !!(data.pairs && data.pairs.length > 0),
    pairs: data.pairs || [],
    lastChecked: Date.now(),
  };
}

/**
 * Get specific pair data
 */
export async function getPairData(
  chainId: string,
  pairAddress: string
): Promise<TokenPair | null> {
  try {
    const response = await fetch(
      `${DEXSCREENER_API}/dex/pairs/${chainId}/${pairAddress}`
    );

    if (!response.ok) return null;

    const data = await response.json() as DexScreenerApiResponse;
    return data.pairs?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Search for pairs
 */
export async function searchPairs(query: string): Promise<TokenPair[]> {
  try {
    const response = await fetch(
      `${DEXSCREENER_API}/dex/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) return [];

    const data = await response.json() as DexScreenerApiResponse;
    return data.pairs || [];
  } catch {
    return [];
  }
}

/**
 * Get profile submission URLs
 * Note: Token profile requires manual submission or paid boost
 */
export function getProfileSubmissionUrl(tokenAddress: string): string {
  return `${DEXSCREENER_FRONTEND}/solana/${tokenAddress}`;
}

/**
 * Format token data for display
 */
export function formatTokenStatus(status: DexScreenerStatus): string {
  if (!status.listed) {
    return `⏳ Not yet listed on DexScreener\nLast checked: ${new Date(status.lastChecked).toISOString()}`;
  }

  const top = status.pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];

  let output = `📊 DexScreener Status\n\n`;
  output += `Token: ${top.baseToken.name} ($${top.baseToken.symbol})\n`;
  output += `Price: $${top.priceUsd}\n`;
  output += `Liquidity: $${top.liquidityUsd.toLocaleString()}\n`;
  output += `Market Cap: $${top.marketCap?.toLocaleString() || 'N/A'}\n`;
  output += `24h Vol: $${top.volume.h24.toLocaleString()}\n`;
  output += `24h Change: ${top.priceChange.h24}%\n\n`;
  output += `Pairs: ${status.pairs.length}\n`;

  const buys24h = status.pairs.reduce((sum, p) => sum + p.txns.h24.buys, 0);
  const sells24h = status.pairs.reduce((sum, p) => sum + p.txns.h24.sells, 0);
  output += `24h Transactions: ${buys24h} buys / ${sells24h} sells\n`;

  output += `\n🔗 ${top.url}`;

  return output;
}

/**
 * Monitor listing status (polls until listed)
 */
export async function waitForListing(
  chainId: string,
  tokenAddress: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onCheck?: (status: ListingCheck) => void;
  } = {}
): Promise<ListingCheck> {
  const { maxAttempts = 60, intervalMs = 30000 } = options;

  for (let i = 0; i < maxAttempts; i++) {
    const check = await checkListing(chainId, tokenAddress);

    if (options.onCheck) {
      options.onCheck(check);
    }

    if (check.isListed) {
      return check;
    }

    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    isListed: false,
    pairCount: 0,
  };
}

/**
 * Get listing tips/guidelines
 */
export function getListingGuidelines(): string {
  return `
DexScreener Listing Guidelines:

1. Automatic Listing:
   - Any token with >$1000 liquidity gets auto-indexed
   - Usually appears within 5-30 minutes of first trade
   
2. Profile Update:
   - Logo icon (PNG, 200x200px)
   - Header image (PNG, 1280x320px)
   - Description (max 500 chars)
   - Social links (Twitter, Telegram, Website)
   - Submit via token page "Edit" button
   
3. Paid Features:
   - Token Boosts: Gets featured placement
   - Ads: Homepage visibility
   
4. Requirements for Profile:
   - Token must be actively traded
   - Website must be live
   - Socials must be active
   - No rug/honeypot indicators

Submit: https://dexscreener.com/solana/{TOKEN_ADDRESS}
  `.trim();
}

export function formatPairLink(chainId: string, tokenAddress: string): string {
  return `${DEXSCREENER_FRONTEND}/${chainId}/${tokenAddress}`;
}
