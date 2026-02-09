/**
 * Allium API Client
 * Rate-limited wrapper for Allium blockchain data APIs
 * Integrated from Marketchoomba (@orbitmm/core)
 * 
 * Powered by Allium
 */

import type {
  AlliumConfig,
  AlliumTokenPrice,
  AlliumWalletTransaction,
  AlliumBalanceHistory,
  AlliumQueryResult,
} from './types.js';

// ============ Error Types ============

export class AlliumError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'AlliumError';
  }
}

export class AlliumRateLimitError extends AlliumError {
  constructor() {
    super('Rate limit exceeded. Wait before retrying.', 429, true);
    this.name = 'AlliumRateLimitError';
  }
}

// ============ Client ============

export class AlliumClient {
  private readonly apiKey: string;
  private readonly queryId?: string;
  private readonly baseUrl: string;
  private readonly rateLimitMs: number;
  private readonly maxRetries: number;
  private lastRequestTime: number = 0;
  
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();
  private readonly defaultCacheTtlMs = 60_000;

  constructor(config: AlliumConfig) {
    this.apiKey = config.apiKey;
    this.queryId = config.queryId;
    this.baseUrl = config.baseUrl ?? 'https://api.allium.so';
    this.rateLimitMs = config.rateLimitMs ?? 1100;
    this.maxRetries = config.maxRetries ?? 3;
  }

  // ============ Rate Limiting ============

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.rateLimitMs) {
      await this.sleep(this.rateLimitMs - elapsed);
    }
    
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ Caching ============

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  private setCache(key: string, data: unknown, ttlMs: number = this.defaultCacheTtlMs): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  // ============ HTTP Layer ============

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    await this.enforceRateLimit();

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        };

        const options: RequestInit = {
          method,
          headers,
        };

        if (body && method === 'POST') {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);

        if (response.status === 429) {
          await this.sleep(2000);
          lastError = new AlliumRateLimitError();
          continue;
        }

        if (response.status === 401) {
          throw new AlliumError('Invalid API key', 401, false);
        }

        if (response.status === 422) {
          const errorBody = await response.text();
          throw new AlliumError(`Validation error: ${errorBody}`, 422, false);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new AlliumError(
            `API error: ${response.status} - ${errorBody}`,
            response.status,
            response.status >= 500
          );
        }

        return await response.json() as T;
      } catch (error) {
        if (error instanceof AlliumError && !error.retryable) {
          throw error;
        }
        lastError = error as Error;
        
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  // ============ Price APIs ============

  async getTokenPrice(chain: string, tokenAddress: string): Promise<AlliumTokenPrice> {
    const cacheKey = `price:${chain}:${tokenAddress}`;
    const cached = this.getCached<AlliumTokenPrice[]>(cacheKey);
    if (cached) return cached[0];

    const result = await this.request<AlliumTokenPrice[]>(
      'POST',
      '/api/v1/developer/prices',
      [{ token_address: tokenAddress, chain }]
    );

    this.setCache(cacheKey, result);
    return result[0];
  }

  // ============ Wallet APIs ============

  async getWalletTransactions(
    chain: string,
    walletAddress: string
  ): Promise<AlliumWalletTransaction[]> {
    const result = await this.request<AlliumWalletTransaction[]>(
      'POST',
      '/api/v1/developer/wallet/transactions',
      [{ chain, address: walletAddress }]
    );

    return result;
  }

  async getWalletBalanceHistory(
    chain: string,
    walletAddress: string
  ): Promise<AlliumBalanceHistory[]> {
    const result = await this.request<AlliumBalanceHistory[]>(
      'POST',
      '/api/v1/developer/wallet/balances/history',
      [{ chain, address: walletAddress }]
    );

    return result;
  }

  async getWalletBalances(
    chain: string,
    walletAddress: string
  ): Promise<{ token_address: string; balance: string }[]> {
    return this.request(
      'POST',
      '/api/v1/developer/wallet/balances',
      [{ chain, address: walletAddress }]
    );
  }

  // ============ Custom SQL Queries ============

  async runQuery(sql: string): Promise<AlliumQueryResult> {
    if (!this.queryId) {
      throw new AlliumError('Query ID required for SQL queries', 400, false);
    }

    const startResult = await this.request<{ run_id: string }>(
      'POST',
      `/api/v1/explorer/queries/${this.queryId}/run-async`,
      { parameters: { sql_query: sql } }
    );

    const runId = startResult.run_id;

    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const statusResult = await this.request<AlliumQueryResult>(
        'GET',
        `/api/v1/explorer/query-runs/${runId}/status`
      );

      if (statusResult.status === 'success') {
        const results = await this.request<unknown[]>(
          'GET',
          `/api/v1/explorer/query-runs/${runId}/results?f=json`
        );
        
        return {
          run_id: runId,
          status: 'success',
          data: results,
        };
      }

      if (statusResult.status === 'failed') {
        return {
          run_id: runId,
          status: 'failed',
          error: statusResult.error ?? 'Query failed',
        };
      }

      attempts++;
      await this.sleep(1000);
    }

    throw new AlliumError('Query timed out after 60 seconds', 408, true);
  }

  // ============ Utility Methods ============

  async getSupportedChains(): Promise<Record<string, string[]>> {
    return this.request(
      'GET',
      '/api/v1/supported-chains/realtime-apis/simple'
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCitation(): string {
    return 'Powered by Allium';
  }
}
