/**
 * Bridge orchestrator — ties quote + sign + status polling together.
 * Analogous to stealthFund() in changenowFunding.ts.
 */

import { LifiClient } from './lifi.js';
import { signAndSendBridgeTx } from './sign.js';
import { BridgeStatus } from './types.js';
import type {
  BridgeQuoteRequest,
  BridgeResult,
  BridgeProgressCallback,
  BridgeQuote,
} from './types.js';

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Execute a full bridge: get quote → sign tx → poll until done.
 * If you already have a quote, pass it via options.quote to skip re-quoting.
 */
export async function executeBridge(
  client: LifiClient,
  request: BridgeQuoteRequest,
  secretKey: Uint8Array,
  rpcUrl: string,
  options?: {
    privateKeyHex?: string;
    quote?: BridgeQuote;
    onProgress?: BridgeProgressCallback;
    timeoutMs?: number;
  },
): Promise<BridgeResult> {
  const startTime = Date.now();
  const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 1. Get quote (or use provided one)
  let quote: BridgeQuote;
  try {
    quote = options?.quote ?? await client.getQuote(request);
  } catch (err) {
    return {
      success: false,
      error: `Quote failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Sign and send the source-chain transaction
  let txHash: string;
  try {
    const result = await signAndSendBridgeTx(
      request.fromChain,
      quote.transactionRequest,
      secretKey,
      rpcUrl,
      options?.privateKeyHex,
    );
    txHash = result.txHash;
  } catch (err) {
    return {
      success: false,
      error: `Transaction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3. Poll status until DONE/FAILED/timeout
  const deadline = startTime + timeout;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const status = await client.getStatus(txHash, quote.tool, request.fromChain, request.toChain);
      options?.onProgress?.(status);

      if (status.status === BridgeStatus.DONE) {
        return {
          success: true,
          txHash,
          receiveTxHash: status.receiving?.txHash,
          amountReceived: status.receiving?.amount,
          durationMs: Date.now() - startTime,
        };
      }

      if (status.status === BridgeStatus.FAILED) {
        return {
          success: false,
          txHash,
          error: status.substatusMessage || 'Bridge failed',
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      // Status poll failures are non-fatal — keep polling
    }
  }

  return {
    success: false,
    txHash,
    error: `Timed out after ${Math.round(timeout / 60_000)} minutes. The bridge may still complete — check the explorer.`,
    durationMs: Date.now() - startTime,
  };
}
