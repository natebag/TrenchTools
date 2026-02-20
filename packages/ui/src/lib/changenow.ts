/**
 * Browser-compatible ChangeNow client for USDC-SOL stealth funding.
 *
 * Self-hosted mode: calls ChangeNow API directly with user-provided API key from localStorage.
 */

const CHANGENOW_DIRECT_BASE = 'https://api.changenow.io/v1';

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

  /** Get an estimated exchange amount for USDC-SOL (Solana) swap. */
  async getEstimate(amountUsdc: number): Promise<ChangeNowEstimate> {
    return this.request('GET', `/exchange-amount/${amountUsdc}/usdcsol_sol`);
  }

  /** Get the minimum exchange amount for the USDC-SOL pair. */
  async getMinAmount(): Promise<number> {
    const result = await this.request<{ minAmount: number }>('GET', '/min-amount/usdcsol_sol');
    return result.minAmount;
  }

  /** Create a new USDC-SOL exchange. */
  async createExchange(amountUsdc: number, destinationAddress: string): Promise<ChangeNowExchange> {
    const apiKey = this.getApiKey();

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
      from: 'usdcsol',
      to: 'sol',
      address: destinationAddress,
      amount: amountUsdc,
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
