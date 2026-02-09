/**
 * Treasury Module - Real Blockchain Data
 * TrenchSniper OS
 * 
 * Production-grade treasury management with:
 * - Real-time SOL balance via Connection.getBalance()
 * - SPL token balances via getTokenAccountsByOwner
 * - WebSocket subscriptions for live updates
 * - Caching with configurable TTL
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  AccountChangeCallback,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
} from '@solana/spl-token';

// ============ Types ============

export interface TreasuryConfig {
  mainWallet: string;
  sniperWallets: string[];
  targetBalance: number; // SOL per sniper wallet
  minTreasuryBalance: number;
  cacheTtlMs?: number; // Default 30000 (30s)
  rpcUrl?: string;
}

export interface TokenBalance {
  mint: string;
  symbol?: string;
  name?: string;
  balance: number;
  uiBalance: string;
  decimals: number;
  usdValue?: number;
}

export interface WalletBalance {
  address: string;
  solBalance: number;
  solUiBalance: string;
  tokens: TokenBalance[];
  totalUsdValue?: number;
  lastUpdated: number;
}

export interface TreasuryStatus {
  mainWallet: WalletBalance;
  sniperWallets: {
    address: string;
    balance: number;
    target: number;
    needsFunding: boolean;
    tokens: TokenBalance[];
    lastUpdated: number;
  }[];
  totalSol: number;
  totalNeeded: number;
  canFundAll: boolean;
  lastUpdated: number;
}

export interface DistributionResult {
  funded: string[];
  failed: string[];
  totalDistributed: number;
  totalFees: number;
  signatures: string[];
}

// ============ Cache ============

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class BalanceCache {
  private cache = new Map<string, CacheEntry<WalletBalance>>();
  private ttlMs: number;

  constructor(ttlMs = 30000) {
    this.ttlMs = ttlMs;
  }

  get(address: string): WalletBalance | null {
    const entry = this.cache.get(address);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(address);
      return null;
    }
    return entry.data;
  }

  set(address: string, data: WalletBalance): void {
    this.cache.set(address, { data, timestamp: Date.now() });
  }

  invalidate(address: string): void {
    this.cache.delete(address);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

// ============ Singleton Cache ============

const balanceCache = new BalanceCache();

// ============ Balance Formatting ============

/**
 * Format lamports to SOL string with 6 decimals
 */
export function formatSolBalance(lamports: number): string {
  const sol = lamports / LAMPORTS_PER_SOL;
  return `${sol.toFixed(6)} SOL`;
}

/**
 * Format token balance with proper decimals
 */
export function formatTokenBalance(
  amount: bigint | number,
  decimals: number,
  symbol = ''
): string {
  const amountNum = typeof amount === 'bigint' ? Number(amount) : amount;
  const uiAmount = amountNum / Math.pow(10, decimals);
  const formatted = uiAmount.toFixed(Math.min(decimals, 6));
  return symbol ? `${formatted} ${symbol}` : formatted;
}

// ============ Real Blockchain Data ============

/**
 * Get SOL balance for an address (real blockchain data)
 */
export async function getSolBalance(
  connection: Connection,
  address: string,
  useCache = true
): Promise<number> {
  // Check cache first
  if (useCache) {
    const cached = balanceCache.get(address);
    if (cached) return cached.solBalance;
  }

  const pubkey = new PublicKey(address);
  const lamports = await connection.getBalance(pubkey, 'confirmed');
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Get all SPL token balances for an address
 */
export async function getTokenBalances(
  connection: Connection,
  owner: string
): Promise<TokenBalance[]> {
  const pubkey = new PublicKey(owner);
  
  const tokenAccounts = await connection.getTokenAccountsByOwner(
    pubkey,
    { programId: TOKEN_PROGRAM_ID },
    'confirmed'
  );

  const tokens: TokenBalance[] = [];

  for (const { account } of tokenAccounts.value) {
    const data = AccountLayout.decode(account.data);
    const mint = new PublicKey(data.mint).toBase58();
    const amount = Number(data.amount);
    
    // Get mint info for decimals
    let decimals = 9; // Default to 9 for SOL-like tokens
    try {
      const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
      if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
        decimals = mintInfo.value.data.parsed.info.decimals;
      }
    } catch {
      // Use default decimals
    }

    const balance = amount / Math.pow(10, decimals);
    
    tokens.push({
      mint,
      balance,
      uiBalance: formatTokenBalance(amount, decimals),
      decimals,
    });
  }

  return tokens;
}

/**
 * Get complete wallet balance (SOL + tokens)
 */
export async function getWalletBalance(
  connection: Connection,
  address: string,
  useCache = true
): Promise<WalletBalance> {
  // Check cache
  if (useCache) {
    const cached = balanceCache.get(address);
    if (cached) return cached;
  }

  const [solBalance, tokens] = await Promise.all([
    getSolBalance(connection, address, false),
    getTokenBalances(connection, address),
  ]);

  const walletBalance: WalletBalance = {
    address,
    solBalance,
    solUiBalance: formatSolBalance(solBalance * LAMPORTS_PER_SOL),
    tokens,
    lastUpdated: Date.now(),
  };

  // Update cache
  balanceCache.set(address, walletBalance);

  return walletBalance;
}

/**
 * Get treasury status with real blockchain data
 */
export async function getTreasuryStatus(
  connection: Connection,
  config: TreasuryConfig
): Promise<TreasuryStatus> {
  // Fetch all balances in parallel
  const [mainBalance, ...sniperBalances] = await Promise.all([
    getWalletBalance(connection, config.mainWallet),
    ...config.sniperWallets.map(addr => getWalletBalance(connection, addr)),
  ]);

  // Calculate sniper wallet statuses
  const sniperStatuses = config.sniperWallets.map((addr, idx) => {
    const wallet = sniperBalances[idx];
    return {
      address: addr,
      balance: wallet.solBalance,
      target: config.targetBalance,
      needsFunding: wallet.solBalance < config.targetBalance * 0.8,
      tokens: wallet.tokens,
      lastUpdated: wallet.lastUpdated,
    };
  });

  // Calculate total needed
  const totalNeeded = sniperStatuses
    .filter(s => s.needsFunding)
    .reduce((sum, s) => sum + (config.targetBalance - s.balance), 0);

  // Total SOL across all wallets
  const totalSol = mainBalance.solBalance + 
    sniperStatuses.reduce((sum, s) => sum + s.balance, 0);

  return {
    mainWallet: mainBalance,
    sniperWallets: sniperStatuses,
    totalSol,
    totalNeeded,
    canFundAll: mainBalance.solBalance >= totalNeeded + config.minTreasuryBalance,
    lastUpdated: Date.now(),
  };
}

// ============ WebSocket Subscriptions ============

export interface BalanceSubscription {
  unsubscribe: () => void;
}

/**
 * Subscribe to real-time balance updates via WebSocket
 */
export function subscribeToBalance(
  connection: Connection,
  address: string,
  callback: (balance: WalletBalance) => void
): BalanceSubscription {
  const pubkey = new PublicKey(address);
  
  const handleChange: AccountChangeCallback = async (accountInfo) => {
    const lamports = accountInfo.lamports;
    const solBalance = lamports / LAMPORTS_PER_SOL;
    
    // Fetch token balances (they don't change with SOL account updates)
    const tokens = await getTokenBalances(connection, address);
    
    const walletBalance: WalletBalance = {
      address,
      solBalance,
      solUiBalance: formatSolBalance(lamports),
      tokens,
      lastUpdated: Date.now(),
    };
    
    // Update cache
    balanceCache.set(address, walletBalance);
    
    callback(walletBalance);
  };

  const subscriptionId = connection.onAccountChange(pubkey, handleChange, 'confirmed');

  return {
    unsubscribe: () => {
      connection.removeAccountChangeListener(subscriptionId);
    },
  };
}

/**
 * Subscribe to multiple wallet balances
 */
export function subscribeToTreasury(
  connection: Connection,
  config: TreasuryConfig,
  callback: (status: TreasuryStatus) => void
): BalanceSubscription {
  const allAddresses = [config.mainWallet, ...config.sniperWallets];
  const subscriptions: BalanceSubscription[] = [];

  // Debounce status recalculation
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const updateStatus = async () => {
    const status = await getTreasuryStatus(connection, config);
    callback(status);
  };

  const scheduleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateStatus, 500);
  };

  // Subscribe to each wallet
  for (const addr of allAddresses) {
    const sub = subscribeToBalance(connection, addr, scheduleUpdate);
    subscriptions.push(sub);
  }

  return {
    unsubscribe: () => {
      subscriptions.forEach(s => s.unsubscribe());
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

// ============ Distribution ============

/**
 * Distribute SOL from main wallet to sniper wallets
 */
export async function distributeFunds(
  connection: Connection,
  config: TreasuryConfig,
  signer: any // Main wallet keypair
): Promise<DistributionResult> {
  const status = await getTreasuryStatus(connection, config);
  const funded: string[] = [];
  const failed: string[] = [];
  const signatures: string[] = [];
  let totalDistributed = 0;
  let totalFees = 0;

  for (const sniper of status.sniperWallets) {
    if (!sniper.needsFunding) {
      funded.push(sniper.address);
      continue;
    }

    const amountToSend = config.targetBalance - sniper.balance;
    const amountLamports = BigInt(Math.floor(amountToSend * LAMPORTS_PER_SOL));

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(config.mainWallet),
          toPubkey: new PublicKey(sniper.address),
          lamports: amountLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
        commitment: 'confirmed',
      });

      funded.push(sniper.address);
      signatures.push(signature);
      totalDistributed += amountToSend;
      totalFees += 0.000005; // ~5000 lamports fee

      // Invalidate cache for updated wallets
      balanceCache.invalidate(sniper.address);
      balanceCache.invalidate(config.mainWallet);
    } catch (error) {
      console.error(`Failed to fund ${sniper.address}:`, error);
      failed.push(sniper.address);
    }
  }

  return {
    funded,
    failed,
    totalDistributed,
    totalFees,
    signatures,
  };
}

/**
 * Auto-fund sniper wallets with progress callback
 */
export async function autoFund(
  connection: Connection,
  config: TreasuryConfig,
  signer: any,
  onProgress?: (msg: string) => void
): Promise<DistributionResult> {
  const status = await getTreasuryStatus(connection, config);

  if (!status.canFundAll) {
    const needed = status.totalNeeded + config.minTreasuryBalance - status.mainWallet.solBalance;
    onProgress?.(`⚠️ Insufficient treasury funds. Need ${needed.toFixed(6)} more SOL`);
    return {
      funded: [],
      failed: config.sniperWallets,
      totalDistributed: 0,
      totalFees: 0,
      signatures: [],
    };
  }

  const needsFunding = status.sniperWallets.filter(s => s.needsFunding).length;
  onProgress?.(`💰 Funding ${needsFunding} wallets...`);

  return distributeFunds(connection, config, signer);
}

// ============ Cache Management ============

/**
 * Invalidate cache for specific address
 */
export function invalidateCache(address: string): void {
  balanceCache.invalidate(address);
}

/**
 * Invalidate entire cache
 */
export function invalidateAllCache(): void {
  balanceCache.invalidateAll();
}

// ============ Display Formatting ============

/**
 * Format treasury status for display
 */
export function formatTreasuryStatus(status: TreasuryStatus): string {
  const mainAddr = status.mainWallet.address;
  let output = `🏦 Treasury Status\n\n`;
  output += `Main Wallet: ${mainAddr.slice(0, 6)}...${mainAddr.slice(-4)}\n`;
  output += `Balance: ${status.mainWallet.solUiBalance}\n`;
  
  if (status.mainWallet.tokens.length > 0) {
    output += `Tokens: ${status.mainWallet.tokens.length}\n`;
  }
  output += `\n`;

  const funded = status.sniperWallets.filter(s => !s.needsFunding).length;
  const needing = status.sniperWallets.filter(s => s.needsFunding).length;

  output += `Sniper Wallets: ${status.sniperWallets.length}\n`;
  output += `✅ Funded: ${funded}\n`;
  output += `⏳ Needs Funding: ${needing}\n`;
  output += `📊 Total Needed: ${formatSolBalance(status.totalNeeded * LAMPORTS_PER_SOL)}\n`;
  output += `💰 Total SOL: ${formatSolBalance(status.totalSol * LAMPORTS_PER_SOL)}\n\n`;

  if (!status.canFundAll) {
    const needed = status.totalNeeded + 0.1 - status.mainWallet.solBalance;
    output += `⚠️ Send ${needed.toFixed(6)} SOL to main wallet\n`;
  } else {
    output += `✅ Ready to fund all wallets\n`;
  }

  return output;
}

/**
 * Format distribution result
 */
export function formatDistributionResult(result: DistributionResult): string {
  const total = result.funded.length + result.failed.length;
  const successRate = total > 0 ? ((result.funded.length / total) * 100).toFixed(0) : '0';

  let output = `💰 Distribution Complete\n\n`;
  output += `✅ Funded: ${result.funded.length}\n`;
  output += `❌ Failed: ${result.failed.length}\n`;
  output += `📊 Success Rate: ${successRate}%\n`;
  output += `💵 Total Sent: ${formatSolBalance(result.totalDistributed * LAMPORTS_PER_SOL)}\n`;
  output += `💸 Fees: ${result.totalFees.toFixed(6)} SOL\n`;

  if (result.signatures.length > 0) {
    output += `\n📝 Signatures:\n`;
    result.signatures.slice(0, 5).forEach(sig => {
      output += `• ${sig.slice(0, 20)}...\n`;
    });
    if (result.signatures.length > 5) {
      output += `  ... and ${result.signatures.length - 5} more\n`;
    }
  }

  if (result.failed.length > 0) {
    output += `\nFailed Wallets:\n`;
    result.failed.forEach(w => {
      output += `• ${w.slice(0, 6)}...${w.slice(-4)}\n`;
    });
  }

  return output;
}

/**
 * Get Solana Pay QR code URI
 */
export function getTreasuryQR(walletAddress: string, amount?: number): string {
  if (amount) {
    return `solana:${walletAddress}?amount=${amount}`;
  }
  return `solana:${walletAddress}`;
}
