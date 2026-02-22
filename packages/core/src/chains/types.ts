/**
 * Multi-Chain Type Definitions for TrenchSniper
 *
 * Defines supported chains, their configurations, and utility helpers.
 * Solana remains the default; BSC + Base share EVM tooling via viem.
 * SUI is declared but not yet implemented (Phase 8).
 */

// ── Chain Identifiers ──

export type ChainId = 'solana' | 'bsc' | 'base' | 'sui';
export type ChainFamily = 'solana' | 'evm' | 'sui';

// ── Chain Configuration ──

export interface ChainConfig {
  id: ChainId;
  family: ChainFamily;
  name: string;
  nativeToken: string;
  nativeDecimals: number;
  /** Block explorer base URL (no trailing slash) */
  explorerUrl: string;
  explorerTxPath: string;
  explorerAddressPath: string;
  explorerTokenPath: string;
  /** Default public RPC endpoint */
  defaultRpcUrl: string;
  /** UI theme color hex */
  color: string;
  /** CAIP-2 chain identifier (used by Printr API) */
  caip2: string;
  /** EVM chain ID (undefined for non-EVM chains) */
  evmChainId?: number;
}

// ── Chain Registry ──

export const CHAINS: Record<ChainId, ChainConfig> = {
  solana: {
    id: 'solana',
    family: 'solana',
    name: 'Solana',
    nativeToken: 'SOL',
    nativeDecimals: 9,
    explorerUrl: 'https://solscan.io',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/account/',
    explorerTokenPath: '/token/',
    defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
    color: '#9945FF',
    caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  },
  bsc: {
    id: 'bsc',
    family: 'evm',
    name: 'BNB Chain',
    nativeToken: 'BNB',
    nativeDecimals: 18,
    explorerUrl: 'https://bscscan.com',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/address/',
    explorerTokenPath: '/token/',
    defaultRpcUrl: 'https://bsc-dataseed.binance.org',
    color: '#F0B90B',
    caip2: 'eip155:56',
    evmChainId: 56,
  },
  base: {
    id: 'base',
    family: 'evm',
    name: 'Base',
    nativeToken: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://basescan.org',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/address/',
    explorerTokenPath: '/token/',
    defaultRpcUrl: 'https://mainnet.base.org',
    color: '#0052FF',
    caip2: 'eip155:8453',
    evmChainId: 8453,
  },
  sui: {
    id: 'sui',
    family: 'sui',
    name: 'SUI',
    nativeToken: 'SUI',
    nativeDecimals: 9,
    explorerUrl: 'https://suiscan.xyz',
    explorerTxPath: '/tx/',
    explorerAddressPath: '/account/',
    explorerTokenPath: '/coin/',
    defaultRpcUrl: 'https://fullnode.mainnet.sui.io',
    color: '#4DA2FF',
    caip2: 'sui:mainnet', // Printr may use different format
  },
};

// ── All chain IDs (useful for iteration) ──

export const ALL_CHAIN_IDS: ChainId[] = ['solana', 'bsc', 'base', 'sui'];

/** Chains that are actually implemented and available right now */
export const ACTIVE_CHAIN_IDS: ChainId[] = ['solana', 'bsc', 'base'];

// ── Utility Functions ──

export function getChainConfig(chain: ChainId): ChainConfig {
  return CHAINS[chain];
}

export function getChainFamily(chain: ChainId): ChainFamily {
  return CHAINS[chain].family;
}

export function isEvmChain(chain: ChainId): boolean {
  return CHAINS[chain].family === 'evm';
}

/**
 * Build a block-explorer link for a tx, address, or token.
 */
export function getExplorerUrl(
  chain: ChainId,
  type: 'tx' | 'address' | 'token',
  hash: string,
): string {
  const cfg = CHAINS[chain];
  const pathMap = {
    tx: cfg.explorerTxPath,
    address: cfg.explorerAddressPath,
    token: cfg.explorerTokenPath,
  };
  return `${cfg.explorerUrl}${pathMap[type]}${hash}`;
}

/**
 * Get the native token label for a chain (e.g. "SOL", "BNB", "ETH").
 */
export function getNativeToken(chain: ChainId): string {
  return CHAINS[chain].nativeToken;
}

/**
 * Get the number of decimals for the native token.
 */
export function getNativeDecimals(chain: ChainId): number {
  return CHAINS[chain].nativeDecimals;
}

// ── Feature Flags ──

export interface ChainFeatures {
  trading: boolean;
  volumeBoost: boolean;
  sniping: boolean;
  botGroups: boolean;
  activityGen: boolean;
  launch: boolean;
  claimFees: boolean;
  ghostHolders: boolean;
  stealthFund: boolean;
  shield: boolean;
}

export const CHAIN_FEATURES: Record<ChainId, ChainFeatures> = {
  solana: {
    trading: true,
    volumeBoost: true,
    sniping: true,
    botGroups: true,
    activityGen: true,
    launch: true,
    claimFees: true,
    ghostHolders: true,
    stealthFund: true,
    shield: true,
  },
  bsc: {
    trading: true,
    volumeBoost: true,
    sniping: true,
    botGroups: true,
    activityGen: true,
    launch: true,
    claimFees: false,
    ghostHolders: false,
    stealthFund: true,
    shield: true,
  },
  base: {
    trading: true,
    volumeBoost: true,
    sniping: true,
    botGroups: true,
    activityGen: true,
    launch: true,
    claimFees: false,
    ghostHolders: false,
    stealthFund: true,
    shield: true,
  },
  sui: {
    trading: false,
    volumeBoost: false,
    sniping: false,
    botGroups: false,
    activityGen: false,
    launch: false,
    claimFees: false,
    ghostHolders: false,
    stealthFund: false,
    shield: false,
  },
};

export function hasFeature(chain: ChainId, feature: keyof ChainFeatures): boolean {
  return CHAIN_FEATURES[chain][feature];
}
