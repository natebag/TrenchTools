/**
 * Raydium AMM Integration
 * TrenchSniper OS - Direct Raydium DEX Integration
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

import { Quote, QuoteParams, SwapResult, Pool, NoRouteError, APIError } from '../trading/types.js';

// ============ Constants ============

export const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_API_URL = 'https://api.raydium.io/v2';
const QUOTE_VALIDITY_MS = 30000;

// ============ Types ============

export interface RaydiumPoolInfo {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  version: number;
  authority: string;
  openOrders: string;
  baseVault: string;
  quoteVault: string;
  marketId: string;
  marketProgramId: string;
  marketAuthority: string;
  marketBaseVault: string;
  marketQuoteVault: string;
  marketBids: string;
  marketAsks: string;
  marketEventQueue: string;
  liquidity?: number;
  volume24h?: number;
}

export interface RaydiumSwapParams {
  wallet: Keypair;
  quote: Quote;
  priorityFee?: number;
}

// ============ Raydium Client ============

export class RaydiumClient {
  private poolCache: Map<string, RaydiumPoolInfo> = new Map();
  private poolCacheExpiry = 0;
  private readonly cacheDurationMs = 60000;

  constructor(
    private readonly connection: Connection,
    private readonly apiUrl: string = RAYDIUM_API_URL
  ) {}

  /**
   * Get swap quote from Raydium AMM
   */
  async getQuote(params: QuoteParams): Promise<Quote> {
    const pool = await this.findPool(
      params.inputMint.toString(),
      params.outputMint.toString()
    );

    if (!pool) {
      throw new NoRouteError(
        params.inputMint.toString(),
        params.outputMint.toString()
      );
    }

    const result = await this.calculateQuote(pool, params);
    const now = Date.now();

    return {
      inputMint: params.inputMint.toString(),
      outputMint: params.outputMint.toString(),
      inAmount: params.amount.toString(),
      outAmount: result.outAmount,
      minOutAmount: result.minOutAmount,
      priceImpactPct: result.priceImpact,
      route: [{
        dex: 'raydium',
        inputMint: params.inputMint.toString(),
        outputMint: params.outputMint.toString(),
        poolId: pool.id,
        percent: 100,
      }],
      dex: 'raydium',
      timestamp: now,
      expiresAt: now + QUOTE_VALIDITY_MS,
    };
  }

  /**
   * Execute swap on Raydium AMM
   */
  async swap(params: RaydiumSwapParams): Promise<SwapResult> {
    const { wallet, quote, priorityFee } = params;

    const pool = await this.findPool(quote.inputMint, quote.outputMint);
    if (!pool) {
      throw new APIError('raydium', 'Pool not found');
    }

    const transaction = await this.buildSwapTransaction(
      wallet,
      pool,
      quote,
      priorityFee
    );

    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 2 }
    );

    const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new APIError('raydium', `Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return {
      signature,
      inputAmount: parseInt(quote.inAmount),
      outputAmount: parseInt(quote.outAmount),
      fee: (priorityFee || 5000) / 1e9,
      slot: confirmation.context.slot,
      timestamp: Date.now(),
    };
  }

  /**
   * Get available Raydium pools for a token
   */
  async getPools(tokenMint: PublicKey): Promise<Pool[]> {
    await this.refreshPoolCache();
    
    const pools: Pool[] = [];
    const mintStr = tokenMint.toString();

    for (const [, poolInfo] of this.poolCache) {
      if (poolInfo.baseMint === mintStr || poolInfo.quoteMint === mintStr) {
        pools.push({
          id: poolInfo.id,
          dex: 'raydium',
          tokenA: { mint: poolInfo.baseMint, symbol: '', decimals: poolInfo.baseDecimals },
          tokenB: { mint: poolInfo.quoteMint, symbol: '', decimals: poolInfo.quoteDecimals },
          liquidity: poolInfo.liquidity ?? 0,
          volume24h: poolInfo.volume24h ?? 0,
        });
      }
    }

    return pools;
  }

  /**
   * Find pool for a token pair
   */
  private async findPool(inputMint: string, outputMint: string): Promise<RaydiumPoolInfo | null> {
    await this.refreshPoolCache();

    for (const [, pool] of this.poolCache) {
      if (
        (pool.baseMint === inputMint && pool.quoteMint === outputMint) ||
        (pool.baseMint === outputMint && pool.quoteMint === inputMint)
      ) {
        return pool;
      }
    }

    return null;
  }

  /**
   * Refresh pool cache from Raydium API
   */
  private async refreshPoolCache(): Promise<void> {
    const now = Date.now();
    if (now < this.poolCacheExpiry) return;

    try {
      const response = await fetch(`${this.apiUrl}/main/pairs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.poolCache.clear();

      if (Array.isArray(data)) {
        for (const pool of data) {
          if (pool.ammId) {
            this.poolCache.set(pool.ammId, {
              id: pool.ammId,
              baseMint: pool.baseMint,
              quoteMint: pool.quoteMint,
              lpMint: pool.lpMint,
              baseDecimals: pool.baseDecimals,
              quoteDecimals: pool.quoteDecimals,
              version: pool.version || 4,
              authority: pool.authority,
              openOrders: pool.openOrders,
              baseVault: pool.baseVault,
              quoteVault: pool.quoteVault,
              marketId: pool.marketId,
              marketProgramId: pool.marketProgramId,
              marketAuthority: pool.marketAuthority,
              marketBaseVault: pool.marketBaseVault,
              marketQuoteVault: pool.marketQuoteVault,
              marketBids: pool.marketBids,
              marketAsks: pool.marketAsks,
              marketEventQueue: pool.marketEventQueue,
              liquidity: pool.liquidity,
              volume24h: pool.volume24h,
            });
          }
        }
      }

      this.poolCacheExpiry = now + this.cacheDurationMs;
    } catch (error) {
      console.warn('Failed to refresh Raydium pool cache:', error);
    }
  }

  /**
   * Calculate swap quote using constant product formula
   */
  private async calculateQuote(
    pool: RaydiumPoolInfo,
    params: QuoteParams
  ): Promise<{ outAmount: string; minOutAmount: string; priceImpact: number }> {
    const isBaseToQuote = params.inputMint.toString() === pool.baseMint;

    const baseBalance = await this.getTokenBalance(new PublicKey(pool.baseVault));
    const quoteBalance = await this.getTokenBalance(new PublicKey(pool.quoteVault));

    const inputReserve = isBaseToQuote ? baseBalance : quoteBalance;
    const outputReserve = isBaseToQuote ? quoteBalance : baseBalance;

    const inputAmount = BigInt(params.amount);
    const fee = inputAmount * 25n / 10000n; // 0.25% fee
    const inputAfterFee = inputAmount - fee;

    const outputAmount = (outputReserve * inputAfterFee) / (inputReserve + inputAfterFee);

    const spotPrice = Number(outputReserve) / Number(inputReserve);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);

    const slippageMultiplier = BigInt(10000 - params.slippageBps);
    const minOutput = (outputAmount * slippageMultiplier) / 10000n;

    return {
      outAmount: outputAmount.toString(),
      minOutAmount: minOutput.toString(),
      priceImpact,
    };
  }

  /**
   * Get token balance from account
   */
  private async getTokenBalance(account: PublicKey): Promise<bigint> {
    try {
      const balance = await this.connection.getTokenAccountBalance(account);
      return BigInt(balance.value.amount);
    } catch {
      return 0n;
    }
  }

  /**
   * Build swap transaction
   */
  private async buildSwapTransaction(
    wallet: Keypair,
    pool: RaydiumPoolInfo,
    quote: Quote,
    priorityFee?: number
  ): Promise<Transaction> {
    const transaction = new Transaction();

    if (priorityFee && priorityFee > 0) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
      );
    }

    const inputMint = new PublicKey(quote.inputMint);
    const outputMint = new PublicKey(quote.outputMint);

    const inputTokenAccount = await getAssociatedTokenAddress(inputMint, wallet.publicKey);
    const outputTokenAccount = await getAssociatedTokenAddress(outputMint, wallet.publicKey);

    const outputAccountInfo = await this.connection.getAccountInfo(outputTokenAccount);
    if (!outputAccountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          outputTokenAccount,
          wallet.publicKey,
          outputMint
        )
      );
    }

    const swapInstruction = this.buildSwapInstruction(
      wallet.publicKey,
      pool,
      inputTokenAccount,
      outputTokenAccount,
      BigInt(quote.inAmount),
      BigInt(quote.minOutAmount)
    );

    transaction.add(swapInstruction);

    const { blockhash, lastValidBlockHeight } = 
      await this.connection.getLatestBlockhash('confirmed');

    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;
    transaction.sign(wallet);

    return transaction;
  }

  /**
   * Build Raydium swap instruction
   */
  private buildSwapInstruction(
    user: PublicKey,
    pool: RaydiumPoolInfo,
    userSourceToken: PublicKey,
    userDestToken: PublicKey,
    amountIn: bigint,
    minAmountOut: bigint
  ): TransactionInstruction {
    const data = Buffer.alloc(17);
    data.writeUInt8(9, 0); // Swap discriminator
    data.writeBigUInt64LE(amountIn, 1);
    data.writeBigUInt64LE(minAmountOut, 9);

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(pool.id), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.authority), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(pool.openOrders), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.baseVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.quoteVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketProgramId), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(pool.marketId), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketBids), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketAsks), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketEventQueue), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketBaseVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketQuoteVault), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(pool.marketAuthority), isSigner: false, isWritable: false },
      { pubkey: userSourceToken, isSigner: false, isWritable: true },
      { pubkey: userDestToken, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: RAYDIUM_PROGRAM_ID,
      data,
    });
  }
}

// ============ Standalone Functions ============

let defaultClient: RaydiumClient | null = null;

function getDefaultClient(connection: Connection): RaydiumClient {
  if (!defaultClient) {
    defaultClient = new RaydiumClient(connection);
  }
  return defaultClient;
}

export async function getQuote(connection: Connection, params: QuoteParams): Promise<Quote> {
  return getDefaultClient(connection).getQuote(params);
}

export async function swap(connection: Connection, params: RaydiumSwapParams): Promise<SwapResult> {
  return getDefaultClient(connection).swap(params);
}

export async function getPools(connection: Connection, tokenMint: PublicKey): Promise<Pool[]> {
  return getDefaultClient(connection).getPools(tokenMint);
}
