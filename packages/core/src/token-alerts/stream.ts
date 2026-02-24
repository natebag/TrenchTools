/**
 * PumpFun new token WebSocket stream.
 * Connects to PumpPortal and fires onAlert for each new token launch.
 * Follows the whale-ws.ts pattern (auto-reconnect, dedup, close).
 */

import type { TokenStreamConfig, PumpPortalNewTokenEvent, NewTokenAlert } from './types.js';
import { PUMPPORTAL_WS_URL } from './types.js';

/**
 * Connect to PumpPortal WebSocket for real-time new token launches.
 * Returns a close() function to disconnect.
 */
export function connectTokenStream(config: TokenStreamConfig): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const bufferSize = config.bufferSize ?? 500;
  const seen = new Set<string>();

  function connect() {
    if (closed) return;

    try {
      ws = new WebSocket(PUMPPORTAL_WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      config.onConnectionChange?.(true);
      // Subscribe to new token creation events
      ws?.send(JSON.stringify({ method: 'subscribeNewToken' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : '') as PumpPortalNewTokenEvent;
        if (!data || !data.mint || data.txType !== 'create') return;

        // Dedup by mint address
        if (seen.has(data.mint)) return;
        seen.add(data.mint);
        if (seen.size > bufferSize) {
          const first = seen.values().next().value;
          if (first) seen.delete(first);
        }

        const alert: NewTokenAlert = {
          id: `${data.mint}:${Date.now()}`,
          mint: data.mint,
          name: data.name || 'Unknown',
          symbol: data.symbol || '???',
          creator: data.traderPublicKey || '',
          initialBuySol: data.initialBuy || 0,
          marketCapSol: data.marketCapSol || 0,
          bondingCurveKey: data.bondingCurveKey || '',
          metadataUri: data.uri || '',
          timestamp: Date.now(),
          signature: data.signature || '',
        };

        config.onAlert(alert);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      config.onConnectionChange?.(false);
      if (!closed) scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    reconnectTimer = setTimeout(connect, 5000);
  }

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
