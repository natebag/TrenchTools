/**
 * TokenSniper - Multi-wallet token sniping engine
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

export interface SnipeConfig {
  /** RPC connection */
  connection: Connection;
  /** Wallets to use for sniping */
  wallets: Keypair[];
  /** Default slippage in basis points */
  slippageBps?: number;
  /** Use Jito bundles */
  useJito?: boolean;
  /** Jito tip in lamports */
  jitoTipLamports?: number;
  /** Jito block engine URL */
  jitoBlockEngine?: string;
}

export interface SnipeParams {
  /** Token mint address */
  tokenMint: PublicKey;
  /** SOL amount per wallet */
  solAmountPerWallet: number;
  /** Slippage in basis points (overrides config) */
  slippageBps?: number;
  /** Maximum price impact % to accept */
  maxPriceImpact?: number;
  /** Wallets to use (defaults to all) */
  walletIndices?: number[];
}

export interface SnipeResult {
  success: boolean;
  wallet: string;
  signature?: string;
  tokensReceived?: bigint;
  solSpent?: number;
  error?: string;
}

export interface ExitParams {
  /** Token mint address */
  tokenMint: PublicKey;
  /** Percentage to sell (1-100) */
  sellPercent: number;
  /** Slippage in basis points */
  slippageBps?: number;
  /** Wallets to exit (defaults to all with balance) */
  walletIndices?: number[];
}

export interface ExitResult {
  success: boolean;
  wallet: string;
  signature?: string;
  tokensSold?: bigint;
  solReceived?: number;
  error?: string;
}

/**
 * TokenSniper class for coordinated multi-wallet sniping
 */
export class TokenSniper {
  private connection: Connection;
  private wallets: Keypair[];
  private slippageBps: number;
  private _useJito: boolean;
  private _jitoTipLamports: number;
  private _jitoBlockEngine: string;

  constructor(config: SnipeConfig) {
    this.connection = config.connection;
    this.wallets = config.wallets;
    this.slippageBps = config.slippageBps ?? 100;
    this._useJito = config.useJito ?? false;
    this._jitoTipLamports = config.jitoTipLamports ?? 10000;
    this._jitoBlockEngine = config.jitoBlockEngine ?? 'https://mainnet.block-engine.jito.wtf';
  }

  /**
   * Get wallet by index
   */
  getWallet(index: number): Keypair | undefined {
    return this.wallets[index];
  }

  /**
   * Get all wallet public keys
   */
  getWalletAddresses(): PublicKey[] {
    return this.wallets.map(w => w.publicKey);
  }

  /**
   * Snipe a token with multiple wallets
   */
  async snipe(params: SnipeParams): Promise<SnipeResult[]> {
    const { tokenMint, solAmountPerWallet, slippageBps, maxPriceImpact, walletIndices } = params;
    const effectiveSlippage = slippageBps ?? this.slippageBps;

    // Determine which wallets to use
    const walletsToUse = walletIndices
      ? walletIndices.map(i => this.wallets[i]).filter(Boolean)
      : this.wallets;

    if (walletsToUse.length === 0) {
      return [{ success: false, wallet: 'none', error: 'No wallets available' }];
    }

    // Import PumpFun client dynamically
    const { PumpFunClient } = await import('@trenchsniper/core');
    const client = new PumpFunClient(this.connection);

    // Check token status
    const tokenInfo = await client.getTokenInfo(tokenMint);
    if (!tokenInfo) {
      return walletsToUse.map(w => ({
        success: false,
        wallet: w.publicKey.toString(),
        error: 'Token not found on PumpFun',
      }));
    }

    if (tokenInfo.isComplete) {
      return walletsToUse.map(w => ({
        success: false,
        wallet: w.publicKey.toString(),
        error: 'Token has migrated to Raydium',
      }));
    }

    // Get quote to check price impact
    const amountLamports = BigInt(Math.floor(solAmountPerWallet * LAMPORTS_PER_SOL));
    const quote = await client.getQuote(tokenMint, amountLamports, true, effectiveSlippage);

    if (maxPriceImpact && quote.priceImpactPct > maxPriceImpact) {
      return walletsToUse.map(w => ({
        success: false,
        wallet: w.publicKey.toString(),
        error: `Price impact ${quote.priceImpactPct.toFixed(2)}% exceeds max ${maxPriceImpact}%`,
      }));
    }

    // Execute buys
    if (this._useJito) {
      return this.snipeWithJito(walletsToUse, tokenMint, amountLamports, effectiveSlippage, client);
    }

    return this.snipeSequential(walletsToUse, tokenMint, amountLamports, effectiveSlippage, client);
  }

  /**
   * Sequential buy execution
   */
  private async snipeSequential(
    wallets: Keypair[],
    tokenMint: PublicKey,
    amountLamports: bigint,
    slippageBps: number,
    client: any
  ): Promise<SnipeResult[]> {
    const results: SnipeResult[] = [];

    for (const wallet of wallets) {
      try {
        const result = await client.buy(wallet, tokenMint, amountLamports, slippageBps);
        
        results.push({
          success: true,
          wallet: wallet.publicKey.toString(),
          signature: result.signature,
          solSpent: Number(amountLamports) / LAMPORTS_PER_SOL,
        });
      } catch (error) {
        results.push({
          success: false,
          wallet: wallet.publicKey.toString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Jito bundle buy execution
   */
  private async snipeWithJito(
    wallets: Keypair[],
    tokenMint: PublicKey,
    amountLamports: bigint,
    slippageBps: number,
    client: any
  ): Promise<SnipeResult[]> {
    // TODO: Full Jito implementation
    // For now, fall back to sequential with warning
    console.warn('Jito bundles not fully implemented, using sequential execution');
    return this.snipeSequential(wallets, tokenMint, amountLamports, slippageBps, client);
  }

  /**
   * Exit token position with multiple wallets
   */
  async exit(params: ExitParams): Promise<ExitResult[]> {
    const { tokenMint, sellPercent, slippageBps, walletIndices } = params;
    const effectiveSlippage = slippageBps ?? this.slippageBps;

    // Determine which wallets to use
    const walletsToUse = walletIndices
      ? walletIndices.map(i => this.wallets[i]).filter(Boolean)
      : this.wallets;

    if (walletsToUse.length === 0) {
      return [{ success: false, wallet: 'none', error: 'No wallets available' }];
    }

    // Import PumpFun client
    const { PumpFunClient } = await import('@trenchsniper/core');
    const client = new PumpFunClient(this.connection);

    // Check token status
    const isOnPumpFun = await client.isOnPumpFun(tokenMint);
    if (!isOnPumpFun) {
      return walletsToUse.map(w => ({
        success: false,
        wallet: w.publicKey.toString(),
        error: 'Token not on PumpFun or has migrated',
      }));
    }

    // Get balances and execute sells
    const results: ExitResult[] = [];

    for (const wallet of walletsToUse) {
      const ata = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);
      
      let balance: bigint;
      try {
        const account = await getAccount(this.connection, ata);
        balance = account.amount;
      } catch {
        results.push({
          success: false,
          wallet: wallet.publicKey.toString(),
          error: 'No token balance',
        });
        continue;
      }

      if (balance === 0n) {
        results.push({
          success: false,
          wallet: wallet.publicKey.toString(),
          error: 'Zero balance',
        });
        continue;
      }

      const sellAmount = balance * BigInt(sellPercent) / 100n;
      if (sellAmount === 0n) continue;

      try {
        const result = await client.sell(wallet, tokenMint, sellAmount, effectiveSlippage);
        
        results.push({
          success: true,
          wallet: wallet.publicKey.toString(),
          signature: result.signature,
          tokensSold: sellAmount,
          solReceived: Number(result.outputAmount) / LAMPORTS_PER_SOL,
        });
      } catch (error) {
        results.push({
          success: false,
          wallet: wallet.publicKey.toString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get token balances across all wallets
   */
  async getBalances(tokenMint: PublicKey): Promise<Map<string, bigint>> {
    const balances = new Map<string, bigint>();

    for (const wallet of this.wallets) {
      const ata = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);
      try {
        const account = await getAccount(this.connection, ata);
        balances.set(wallet.publicKey.toString(), account.amount);
      } catch {
        balances.set(wallet.publicKey.toString(), 0n);
      }
    }

    return balances;
  }

  /**
   * Get SOL balances across all wallets
   */
  async getSolBalances(): Promise<Map<string, number>> {
    const balances = new Map<string, number>();

    for (const wallet of this.wallets) {
      const balance = await this.connection.getBalance(wallet.publicKey);
      balances.set(wallet.publicKey.toString(), balance / LAMPORTS_PER_SOL);
    }

    return balances;
  }
}
