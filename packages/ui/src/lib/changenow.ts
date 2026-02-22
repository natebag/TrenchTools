/**
 * Browser-compatible ChangeNow client for stealth funding.
 *
 * Supports multi-chain: USDC→SOL (Solana), USDC→BNB (BSC), USDC→ETH (Base).
 * Self-hosted mode: calls ChangeNow API directly with user-provided API key from localStorage.
 */

import { type ChainId, CHANGENOW_PAIRS } from '@trenchtools/core';

const CHANGENOW_DIRECT_BASE = 'https://api.changenow.io/v1';

/** Get the ChangeNow pair string for a given chain (e.g. "usdcsol_sol") */
function getPairString(chain: ChainId = 'solana'): string {
  const pair = CHANGENOW_PAIRS[chain];
  return `${pair.from}_${pair.to}`;
}

// ── Types ──

export enum ChangeNowStatus {
  NEW = 'new',
  WAITING = 'waiting',
  CONFIRMING = 'confirming',
  EXCHANGING = 'exchanging',
  SENDING = 'sending',
  FINISHED = 'finished',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  VERIFYING = 'verifying',
  EXPIRED = 'expired',
}

/** Human-readable labels for each ChangeNow status. */
export const CHANGENOW_STATUS_LABELS: Record<string, string> = {
  [ChangeNowStatus.NEW]: 'New',
  [ChangeNowStatus.WAITING]: 'Waiting for deposit',
  [ChangeNowStatus.CONFIRMING]: 'Confirming deposit',
  [ChangeNowStatus.EXCHANGING]: 'Exchanging',
  [ChangeNowStatus.SENDING]: 'Sending funds',
  [ChangeNowStatus.FINISHED]: 'Finished',
  [ChangeNowStatus.FAILED]: 'Failed',
  [ChangeNowStatus.REFUNDED]: 'Refunded',
  [ChangeNowStatus.VERIFYING]: 'Verifying',
  [ChangeNowStatus.EXPIRED]: 'Expired',
};

export interface ChangeNowEstimate {
  estimatedAmount: number;
  transactionSpeedForecast: string;
  warningMessage?: string;
}

export interface ChangeNowExchange {
  id: string;
  payinAddress: string;
  payoutAddress: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  expectedReceive: number;
  status: ChangeNowStatus;
}

export interface ChangeNowTxStatus {
  id: string;
  status: ChangeNowStatus;
  statusLabel: string;
  payinAddress: string;
  payoutAddress: string;
  amountSend: number;
  amountReceive: number;
}

// ── Availability check ──

/** Check if stealth funding is available (ChangeNow API key configured). */
export function isStealthAvailable(): boolean {
  return !!localStorage.getItem('changenow_api_key');
}

/** Whether stealth funding toggle is ON. */
export function isStealthEnabled(): boolean {
  return localStorage.getItem('trench_stealth_funding') === 'true';
}

/** Set stealth funding toggle. */
export function setStealthEnabled(enabled: boolean): void {
  localStorage.setItem('trench_stealth_funding', String(enabled));
}

// ── Client ──

export class ChangeNowClient {
  private baseUrl = CHANGENOW_DIRECT_BASE;

  /** Get the user's ChangeNow API key from localStorage. */
  private getApiKey(): string {
    return localStorage.getItem('changenow_api_key') || '';
  }

  /** Generic fetch wrapper with error handling. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) init.body = JSON.stringify(body);

    const resp = await fetch(url, init);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`ChangeNow API error ${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  /** Get an estimated exchange amount for a stealth swap on the given chain. */
  async getEstimate(amountUsdc: number, chain: ChainId = 'solana'): Promise<ChangeNowEstimate> {
    const pair = getPairString(chain);
    return this.request('GET', `/exchange-amount/${amountUsdc}/${pair}`);
  }

  /** Get the minimum exchange amount for the given chain's pair. */
  async getMinAmount(chain: ChainId = 'solana'): Promise<number> {
    const pair = getPairString(chain);
    const result = await this.request<{ minAmount: number }>('GET', `/min-amount/${pair}`);
    return result.minAmount;
  }

  /** Create a new stealth exchange for the given chain. */
  async createExchange(amountUsdc: number, destinationAddress: string, chain: ChainId = 'solana'): Promise<ChangeNowExchange> {
    const apiKey = this.getApiKey();
    const cnPair = CHANGENOW_PAIRS[chain];

    const result = await this.request<{
      id: string;
      payinAddress: string;
      payoutAddress: string;
      fromCurrency: string;
      toCurrency: string;
      amount: number;
      expectedReceiveAmount?: number;
      status: string;
    }>('POST', `/transactions/${apiKey}`, {
      from: cnPair.from,
      to: cnPair.to,
      address: destinationAddress,
      amount: amountUsdc,
      ...(cnPair.network ? { network: cnPair.network } : {}),
    });

    return {
      id: result.id,
      payinAddress: result.payinAddress,
      payoutAddress: result.payoutAddress,
      fromCurrency: result.fromCurrency,
      toCurrency: result.toCurrency,
      amount: amountUsdc,
      expectedReceive: result.expectedReceiveAmount || 0,
      status: (result.status as ChangeNowStatus) || ChangeNowStatus.NEW,
    };
  }

  /** Get the current status of an exchange transaction. */
  async getStatus(txId: string): Promise<ChangeNowTxStatus> {
    const apiKey = this.getApiKey();

    const result = await this.request<{
      id: string;
      status: string;
      payinAddress: string;
      payoutAddress: string;
      amountSend: number;
      amountReceive: number;
    }>('GET', `/transactions/${txId}/${apiKey}`);

    return {
      id: result.id,
      status: result.status as ChangeNowStatus,
      statusLabel: CHANGENOW_STATUS_LABELS[result.status] || 'Unknown',
      payinAddress: result.payinAddress,
      payoutAddress: result.payoutAddress,
      amountSend: result.amountSend,
      amountReceive: result.amountReceive,
    };
  }
}
