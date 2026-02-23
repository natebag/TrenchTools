/**
 * Li.Fi REST API client for cross-chain bridging.
 *
 * API docs: https://docs.li.fi/
 * Base URL: https://li.quest/v1
 * No API key required for basic usage (200 req/2hr on /quote).
 */

import type { ChainId } from '../chains/types.js';
import {
  LIFI_CHAIN_MAP,
  LIFI_NATIVE_TOKENS,
  BridgeStatus,
} from './types.js';
import type {
  BridgeQuoteRequest,
  BridgeQuote,
  BridgeStatusResponse,
} from './types.js';

const LIFI_BASE_URL = 'https://li.quest/v1';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const FETCH_TIMEOUT_MS = 30_000;

export class LifiApiError extends Error {
  constructor(message: string, public statusCode: number, public body?: string) {
    super(message);
    this.name = 'LifiApiError';
  }
}

export class LifiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || LIFI_BASE_URL;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt - 1)));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const resp = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);

        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          // Don't retry 4xx (client errors)
          if (resp.status >= 400 && resp.status < 500) {
            throw new LifiApiError(`Li.Fi API error ${resp.status}: ${body}`, resp.status, body);
          }
          // Retry 5xx
          lastError = new LifiApiError(`Li.Fi API error ${resp.status}`, resp.status, body);
          continue;
        }

        return (await resp.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof LifiApiError && err.statusCode >= 400 && err.statusCode < 500) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error('Li.Fi request failed after retries');
  }

  /** Get a bridge quote with transaction data ready to sign */
  async getQuote(req: BridgeQuoteRequest): Promise<BridgeQuote> {
    const fromChainKey = LIFI_CHAIN_MAP[req.fromChain];
    const toChainKey = LIFI_CHAIN_MAP[req.toChain];
    const fromToken = req.fromToken || LIFI_NATIVE_TOKENS[req.fromChain];
    const toToken = req.toToken || LIFI_NATIVE_TOKENS[req.toChain];

    const raw = await this.request<Record<string, any>>('/quote', {
      fromChain: fromChainKey,
      toChain: toChainKey,
      fromToken,
      toToken,
      fromAmount: req.fromAmount,
      fromAddress: req.fromAddress,
      toAddress: req.toAddress,
    });

    const estimate = raw.estimate || {};
    const action = raw.action || {};

    return {
      id: raw.id || `${fromChainKey}-${toChainKey}-${Date.now()}`,
      fromChain: req.fromChain,
      toChain: req.toChain,
      estimate: {
        fromAmount: action.fromAmount || req.fromAmount,
        toAmount: estimate.toAmount || '0',
        toAmountMin: estimate.toAmountMin || estimate.toAmount || '0',
        executionDurationSeconds: estimate.executionDuration || 0,
        feeCosts: (estimate.feeCosts || []).map((f: any) => ({
          name: f.name || 'Bridge fee',
          amount: f.amount || '0',
          amountUSD: f.amountUSD || '0',
          token: { symbol: f.token?.symbol || '?', decimals: f.token?.decimals || 18 },
        })),
        gasCosts: (estimate.gasCosts || []).map((g: any) => ({
          name: g.type || 'Gas',
          amount: g.amount || '0',
          amountUSD: g.amountUSD || '0',
          token: { symbol: g.token?.symbol || '?', decimals: g.token?.decimals || 18 },
        })),
      },
      transactionRequest: raw.transactionRequest || {},
      tool: raw.tool || action.tool || 'unknown',
      toolDetails: raw.toolDetails,
    };
  }

  /** Poll bridge transaction status */
  async getStatus(
    txHash: string,
    bridge: string,
    fromChain: ChainId,
    toChain: ChainId,
  ): Promise<BridgeStatusResponse> {
    const result = await this.request<Record<string, any>>('/status', {
      txHash,
      bridge,
      fromChain: LIFI_CHAIN_MAP[fromChain],
      toChain: LIFI_CHAIN_MAP[toChain],
    });

    return {
      status: (result.status as BridgeStatus) || BridgeStatus.NOT_FOUND,
      substatus: result.substatus,
      substatusMessage: result.substatusMessage,
      sending: result.sending,
      receiving: result.receiving,
    };
  }
}
