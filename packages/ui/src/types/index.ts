export interface Wallet {
  id: string;
  address: string;
  name: string;
  balance: number;
  encrypted: boolean;
  type: 'sniper' | 'treasury' | 'burner';
  privateKey?: string;
  derivationPath?: string;
}

export interface SniperConfig {
  enabled: boolean;
  minLiquidity: number;
  maxSlippage: number;
  gasMultiplier: number;
  autoSell: boolean;
  takeProfit: number;
  stopLoss: number;
  maxHoldingTime: number;
}

export interface ShieldResult {
  address: string;
  riskScore: number;
  isHoneypot: boolean;
  canSell: boolean;
  hasMint: boolean;
  hasPause: boolean;
  isRugPull: boolean;
  warnings: string[];
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
  liquidity: number;
  marketCap: number;
  priceChange24h: number;
}

export interface PnLData {
  date: string;
  profit: number;
  loss: number;
  totalTrades: number;
}

export interface ActivityLog {
  id: string;
  timestamp: Date;
  type: 'buy' | 'sell' | 'fund' | 'error' | 'scan';
  description: string;
  txHash?: string;
  amount?: number;
  token?: string;
}

export interface TreasuryState {
  treasuryBalance: number;
  allocatedToSnipers: number;
  totalProfit: number;
  totalLoss: number;
  dailyVolume: number;
}

export interface Settings {
  rpcUrl: string;
  chainId: number;
  apiKey: string;
  encryptionPassword?: string;
  theme: 'dark' | 'light';
}
