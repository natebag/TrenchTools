/**
 * Smart Trading Router
 * TrenchSniper OS - Automatic DEX routing with migration detection
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';

import {
  Quote,
  QuoteParams,
  SwapResult,
  Pool,
  NoRouteError,
  SwapTransactionError,
} from '../trading/types.js';

import * as pumpfun from './pumpfun.js';
import * as raydium from './raydium.js';
import * as meteora from './meteora.js';

// ============ Types ============

export type RouterDEX = 'pumpfun' | 'raydium' | 'meteora';

export interface RouterConfig {
  pumpfunEnabled: boolean;
  raydiumEnabled: boolean;
  meteoraEnabled: boolean;
  fallbackOrder: RouterDEX[];
  parallelQuotes: boolean;
  maxPriceImpactPct: number;
  maxQuoteAgeMs: number;
}

export interface PoolMigrationResult {
  migrated: boolean;
  from?: RouterDEX;
  to?: RouterDEX;
  oldPoolId?: string;
  newPoolId?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  pumpfunEnabled: true,
  raydiumEnabled: true,
  meteoraEnabled: true,
  fallbackOrder: ['pumpfun', 'raydium', 'meteora'],
  parallelQuotes: true,
  maxPriceImpactPct: 15,
  maxQuoteAgeMs: 30000,
};

// ============ Smart Router ============

export class SmartRouter {
  private config: RouterConfig;

  constructor(
    private readonly connection: Connection,
    config: Partial<RouterConfig> = {}
  ) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
  }

  /**
   * Get best quote across all enabled DEXs
   */
  async getBestQuote(params: QuoteParams): Promise<Quote> {
    const quotes = await this.getAllQuotes(params);

    if (quotes.length === 0) {
      throw new NoRouteError(
        params.inputMint.toString(),
        params.outputMint.toString()
      );
    }

    return this.selectBestQuote(quotes);
  }

  /**
   * Get quote from a specific DEX
   */
  async getQuoteFromDex(params: QuoteParams, dex: RouterDEX): Promise<Quote> {
    switch (dex) {
      case 'pumpfun':
        if (!this.config.pumpfunEnabled) {
          throw new Error('PumpFun disabled');
        }
        return this.getPumpfunQuote(params);

      case 'raydium':
        if (!this.config.raydiumEnabled) {
          throw new Error('Raydium disabled');
        }
        return raydium.getQuote(this.connection, params);

      case 'meteora':
        if (!this.config.meteoraEnabled) {
          throw new Error('Meteora disabled');
        }
        return meteora.getQuote(this.connection, params);

      default:
        throw new Error(`Unknown DEX: ${dex}`);
    }
  }

  /**
   * Execute swap with automatic DEX selection
   */
  async executeSwap(
    wallet: Keypair,
    params: QuoteParams,
    priorityFee?: number
  ): Promise<SwapResult> {
    const quote = await this.getBestQuote(params);

    const validation = this.validateQuote(quote);
    if (!validation.valid) {
      throw new SwapTransactionError(`Validation failed: ${validation.reason}`);
    }

    return this.performSwap(wallet, quote, priorityFee);
  }

  /**
   * Detect if token has migrated from PumpFun to Raydium/Meteora
   */
  async detectPoolMigration(tokenMint: PublicKey): Promise<PoolMigrationResult> {
    try {
      // Check PumpFun status
      if (this.config.pumpfunEnabled) {
        await pumpfun.isOnPumpFun(this.connection, tokenMint);
      }

      const hasMigratedFromPump = this.config.pumpfunEnabled
        ? await pumpfun.hasMigrated(this.connection, tokenMint)
        : false;

      // Get pools from other DEXs
      const [raydiumPools, meteoraPools] = await Promise.allSettled([
        this.config.raydiumEnabled
          ? raydium.getPools(this.connection, tokenMint)
          : Promise.resolve([]),
        this.config.meteoraEnabled
          ? meteora.getPools(this.connection, tokenMint)
          : Promise.resolve([]),
      ]);

      const rayPools = raydiumPools.status === 'fulfilled' ? raydiumPools.value : [];
      const metPools = meteoraPools.status === 'fulfilled' ? meteoraPools.value : [];

      // PumpFun -> Raydium migration
      if (hasMigratedFromPump && rayPools.length > 0) {
        return {
          migrated: true,
          from: 'pumpfun',
          to: 'raydium',
          newPoolId: rayPools[0].id,
        };
      }

      // PumpFun -> Meteora migration (less common)
      if (hasMigratedFromPump && metPools.length > 0 && rayPools.length === 0) {
        return {
          migrated: true,
          from: 'pumpfun',
          to: 'meteora',
          newPoolId: metPools[0].id,
        };
      }

      // Raydium -> Meteora migration (by liquidity comparison)
      if (rayPools.length > 0 && metPools.length > 0) {
        const rayLiquidity = rayPools.reduce((sum, p) => sum + p.liquidity, 0);
        const metLiquidity = metPools.reduce((sum, p) => sum + p.liquidity, 0);

        if (metLiquidity > rayLiquidity * 2) {
          return {
            migrated: true,
            from: 'raydium',
            to: 'meteora',
            oldPoolId: rayPools[0].id,
            newPoolId: metPools[0].id,
          };
        }
      }

      return { migrated: false };
    } catch (error) {
      console.warn('Migration detection failed:', error);
      return { migrated: false };
    }
  }

  /**
   * Find which DEXs have liquidity for a token
   */
  async findAvailableDexes(tokenMint: PublicKey): Promise<RouterDEX[]> {
    const available: RouterDEX[] = [];

    const checks = await Promise.allSettled([
      this.config.pumpfunEnabled
        ? pumpfun.isOnPumpFun(this.connection, tokenMint)
        : Promise.resolve(false),
      this.config.raydiumEnabled
        ? raydium.getPools(this.connection, tokenMint)
        : Promise.resolve([]),
      this.config.meteoraEnabled
        ? meteora.getPools(this.connection, tokenMint)
        : Promise.resolve([]),
    ]);

    if (checks[0].status === 'fulfilled' && checks[0].value === true) {
      available.push('pumpfun');
    }
    if (checks[1].status === 'fulfilled' && (checks[1].value as Pool[]).length > 0) {
      available.push('raydium');
    }
    if (checks[2].status === 'fulfilled' && (checks[2].value as Pool[]).length > 0) {
      available.push('meteora');
    }

    return available;
  }

  /**
   * Get best DEX for a token (considers migration)
   */
  async getBestDex(tokenMint: PublicKey): Promise<RouterDEX | null> {
    const migration = await this.detectPoolMigration(tokenMint);
    
    if (migration.migrated && migration.to) {
      return migration.to;
    }

    const available = await this.findAvailableDexes(tokenMint);
    
    // Follow fallback order
    for (const dex of this.config.fallbackOrder) {
      if (available.includes(dex)) {
        return dex;
      }
    }

    return null;
  }

  /**
   * Get quotes from all enabled DEXs
   */
  private async getAllQuotes(params: QuoteParams): Promise<Quote[]> {
    const quotes: Quote[] = [];
    const quotePromises: Promise<Quote>[] = [];

    for (const dex of this.config.fallbackOrder) {
      try {
        switch (dex) {
          case 'pumpfun':
            if (this.config.pumpfunEnabled) {
              quotePromises.push(this.getPumpfunQuote(params));
            }
            break;
          case 'raydium':
            if (this.config.raydiumEnabled) {
              quotePromises.push(raydium.getQuote(this.connection, params));
            }
            break;
          case 'meteora':
            if (this.config.meteoraEnabled) {
              quotePromises.push(meteora.getQuote(this.connection, params));
            }
            break;
        }
      } catch {
        // Continue to next DEX
      }
    }

    if (this.config.parallelQuotes) {
      const results = await Promise.allSettled(quotePromises);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          quotes.push(result.value);
        }
      }
    } else {
      for (const promise of quotePromises) {
        try {
          const quote = await promise;
          quotes.push(quote);
        } catch {
          // Continue
        }
      }
    }

    return quotes;
  }

  /**
   * Get PumpFun quote in standard format
   */
  private async getPumpfunQuote(params: QuoteParams): Promise<Quote> {
    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    const isBuying = params.inputMint.equals(SOL_MINT);
    const tokenMint = isBuying ? params.outputMint : params.inputMint;

    const pumpQuote = await pumpfun.getQuote(
      this.connection,
      tokenMint,
      BigInt(params.amount),
      isBuying,
      params.slippageBps
    );

    return {
      inputMint: pumpQuote.inputMint,
      outputMint: pumpQuote.outputMint,
      inAmount: pumpQuote.inAmount,
      outAmount: pumpQuote.outAmount,
      minOutAmount: pumpQuote.minOutAmount,
      priceImpactPct: pumpQuote.priceImpactPct,
      route: [{
        dex: 'pumpfun',
        inputMint: pumpQuote.inputMint,
        outputMint: pumpQuote.outputMint,
        poolId: pumpQuote.bondingCurveAddress,
        percent: 100,
      }],
      dex: 'pumpfun',
      timestamp: pumpQuote.timestamp,
      expiresAt: pumpQuote.expiresAt,
    };
  }

  /**
   * Select best quote from multiple options
   */
  private selectBestQuote(quotes: Quote[]): Quote {
    if (quotes.length === 1) return quotes[0];

    return quotes.sort((a, b) => {
      const aOut = BigInt(a.outAmount);
      const bOut = BigInt(b.outAmount);
      if (aOut > bOut) return -1;
      if (aOut < bOut) return 1;
      return a.priceImpactPct - b.priceImpactPct;
    })[0];
  }

  /**
   * Validate quote before execution
   */
  private validateQuote(quote: Quote): ValidationResult {
    const quoteAge = Date.now() - quote.timestamp;
    
    if (quoteAge > this.config.maxQuoteAgeMs) {
      return { valid: false, reason: `Quote expired (${quoteAge}ms old)` };
    }

    if (quote.priceImpactPct > this.config.maxPriceImpactPct) {
      return { valid: false, reason: `Price impact too high (${quote.priceImpactPct}%)` };
    }

    if (Date.now() > quote.expiresAt) {
      return { valid: false, reason: 'Quote has expired' };
    }

    return { valid: true };
  }

  /**
   * Perform swap on appropriate DEX
   */
  private async performSwap(
    wallet: Keypair,
    quote: Quote,
    priorityFee?: number
  ): Promise<SwapResult> {
    const dex = quote.dex as RouterDEX;

    switch (dex) {
      case 'pumpfun': {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const isBuying = quote.inputMint === SOL_MINT;
        const tokenMint = new PublicKey(isBuying ? quote.outputMint : quote.inputMint);

        const result = isBuying
          ? await pumpfun.buy(this.connection, wallet, tokenMint, BigInt(quote.inAmount))
          : await pumpfun.sell(this.connection, wallet, tokenMint, BigInt(quote.inAmount));

        return {
          signature: result.signature,
          inputAmount: Number(result.inputAmount),
          outputAmount: Number(result.outputAmount),
          fee: 0,
          slot: result.slot,
          timestamp: result.timestamp,
        };
      }

      case 'raydium':
        return raydium.swap(this.connection, { wallet, quote, priorityFee });

      case 'meteora':
        return meteora.swap(this.connection, { wallet, quote, priorityFee });

      default:
        throw new SwapTransactionError(`Unknown DEX: ${dex}`);
    }
  }
}

// ============ Standalone Functions ============

let defaultRouter: SmartRouter | null = null;

function getDefaultRouter(connection: Connection): SmartRouter {
  if (!defaultRouter) {
    defaultRouter = new SmartRouter(connection);
  }
  return defaultRouter;
}

export async function getBestQuote(connection: Connection, params: QuoteParams): Promise<Quote> {
  return getDefaultRouter(connection).getBestQuote(params);
}

export async function executeSwap(
  connection: Connection,
  wallet: Keypair,
  params: QuoteParams,
  priorityFee?: number
): Promise<SwapResult> {
  return getDefaultRouter(connection).executeSwap(wallet, params, priorityFee);
}

export async function detectPoolMigration(
  connection: Connection,
  tokenMint: PublicKey
): Promise<PoolMigrationResult> {
  return getDefaultRouter(connection).detectPoolMigration(tokenMint);
}

export async function findAvailableDexes(
  connection: Connection,
  tokenMint: PublicKey
): Promise<RouterDEX[]> {
  return getDefaultRouter(connection).findAvailableDexes(tokenMint);
}

export async function getBestDex(
  connection: Connection,
  tokenMint: PublicKey
): Promise<RouterDEX | null> {
  return getDefaultRouter(connection).getBestDex(tokenMint);
}
