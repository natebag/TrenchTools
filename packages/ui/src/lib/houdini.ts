/**
 * Browser-compatible Houdini Swap client for stealth wallet funding.
 *
 * Self-hosted mode: calls Houdini API directly with user-provided keys from localStorage.
 * If CORS blocks direct calls, run the optional houdini-proxy script.
 */

const HOUDINI_DIRECT_BASE = 'https://api-partner.houdiniswap.com';

// ── Types ──

export enum HoudiniStatus {
  NEW = -1,
  WAITING = 0,
  CONFIRMING = 1,
  EXCHANGING = 2,
  ANONYMIZING = 3,
  FINISHED = 4,
  EXPIRED = 5,
  FAILED = 6,
  REFUNDED = 7,
}

export const HOUDINI_STATUS_LABELS: Record<number, string> = {
  [-1]: 'New',
  [0]: 'Waiting for deposit',
  [1]: 'Confirming deposit',
  [2]: 'Exchanging',
  [3]: 'Anonymizing',
  [4]: 'Finished',
  [5]: 'Expired',
  [6]: 'Failed',
  [7]: 'Refunded',
};

export interface HoudiniQuote {
  amountIn: number;
  amountOut: number;
  min: number;
  max: number;
  durationMinutes: number;
  fee: number;
}

export interface HoudiniExchange {
  houdiniId: string;
  depositAddress: string;
  depositAmount: number;
  expectedReceive: number;
  status: HoudiniStatus;
}

export interface HoudiniOrderStatus {
  houdiniId: string;
  status: HoudiniStatus;
  statusLabel: string;
  inAmount: number;
  outAmount: number;
  receiverAddress: string;
}

// ── Availability check ──

/** Check if Houdini stealth funding is available (both API keys configured). */
export function isHoudiniAvailable(): boolean {
  const key = localStorage.getItem('houdini_api_key');
  const secret = localStorage.getItem('houdini_api_secret');
  return !!(key && secret);
}

/** Whether stealth funding toggle is ON. */
export function isStealthEnabled(): boolean {
  return localStorage.getItem('trench_stealth_funding') === 'true';
}

export function setStealthEnabled(enabled: boolean): void {
  localStorage.setItem('trench_stealth_funding', String(enabled));
}

// ── Client ──

export class HoudiniClient {
  private baseUrl: string;
  private getHeaders: () => Record<string, string>;

  constructor() {
    this.baseUrl = HOUDINI_DIRECT_BASE;
    this.getHeaders = () => {
      const apiKey = localStorage.getItem('houdini_api_key') || '';
      const apiSecret = localStorage.getItem('houdini_api_secret') || '';
      return {
        authorization: `${apiKey}:${apiSecret}`,
        'Content-Type': 'application/json',
      };
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = { method, headers: this.getHeaders() };
    if (body) init.body = JSON.stringify(body);

    const resp = await fetch(url, init);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Houdini API error ${resp.status}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  private async getSolTokenId(): Promise<string> {
    const tokens = await this.request<Array<{ id: string; symbol: string; network: { shortName: string } }>>(
      'GET',
      '/tokens',
    );
    const sol = tokens.find((t) => t.symbol === 'SOL' && t.network?.shortName === 'SOL');
    if (!sol) throw new Error('SOL token not found on Houdini');
    return sol.id;
  }

  async getQuote(amountSol: number): Promise<HoudiniQuote> {
    const solId = await this.getSolTokenId();

    const result = await this.request<{
      amountIn: number; amountOut: number; min: number; max: number; duration: number;
    }>('GET', `/quote?from=${solId}&to=${solId}&amount=${amountSol}&anonymous=true`);

    return {
      amountIn: result.amountIn,
      amountOut: result.amountOut,
      min: result.min,
      max: result.max,
      durationMinutes: result.duration,
      fee: result.amountIn - result.amountOut,
    };
  }

  async getMinMax(): Promise<{ min: number; max: number }> {
    const solId = await this.getSolTokenId();

    const result = await this.request<[number, number]>(
      'GET',
      `/getMinMax?from=${solId}&to=${solId}&anonymous=true`,
    );
    return { min: result[0], max: result[1] };
  }

  async createExchange(amountSol: number, destinationAddress: string): Promise<HoudiniExchange> {
    const solId = await this.getSolTokenId();

    const result = await this.request<{
      houdiniId: string; senderAddress: string; status: number; inAmount: number; outAmount: number;
    }>('POST', '/exchange', {
      from: solId,
      to: solId,
      amount: amountSol,
      addressTo: destinationAddress,
      anonymous: true,
    });

    return {
      houdiniId: result.houdiniId,
      depositAddress: result.senderAddress,
      depositAmount: amountSol,
      expectedReceive: result.outAmount || amountSol * 0.99,
      status: result.status as HoudiniStatus,
    };
  }

  async getStatus(houdiniId: string): Promise<HoudiniOrderStatus> {
    const result = await this.request<{
      houdiniId: string; status: number; inAmount: number; outAmount: number; receiverAddress: string;
    }>('GET', `/status?id=${houdiniId}`);

    return {
      houdiniId: result.houdiniId,
      status: result.status as HoudiniStatus,
      statusLabel: HOUDINI_STATUS_LABELS[result.status] || 'Unknown',
      inAmount: result.inAmount,
      outAmount: result.outAmount,
      receiverAddress: result.receiverAddress,
    };
  }
}
