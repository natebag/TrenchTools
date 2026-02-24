/**
 * Wallet Tracker types — tracked wallets, holdings, trades, and stats.
 */

export interface TrackedWallet {
  id: string;
  address: string;
  label: string;
  chain: 'solana';
  addedAt: number;
  lastChecked?: number;
}

export interface WalletHolding {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  usdValue?: number;
  imageUrl?: string;
}

export interface WalletTrade {
  signature: string;
  timestamp: number;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol: string;
  tokenAmount: number;
  solAmount: number;
  pricePerToken: number;
  source: string;
}

export interface TraderStats {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  uniqueTokens: number;
  winRate: number;
  totalPnlSol: number;
  avgHoldTimeMs: number;
  bestTradePnlSol: number;
  worstTradePnlSol: number;
}

export interface WalletTradeAlert {
  id: string;
  walletAddress: string;
  walletLabel: string;
  trade: WalletTrade;
  timestamp: number;
}
