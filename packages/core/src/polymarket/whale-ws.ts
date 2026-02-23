/**
 * Polymarket whale trade WebSocket — real-time large trade alerts.
 * Connects to Polymarket's WebSocket feed and filters by USD threshold.
 */

import type { PolymarketWhaleAlert } from './types.js';
import { POLYMARKET_APIS } from './types.js';

export interface WhaleWsConfig {
  /** Minimum USD value to trigger an alert */
  minUsdValue: number;
  /** Callback when a whale trade is detected */
  onAlert: (alert: PolymarketWhaleAlert) => void;
  /** Optional: only track specific condition IDs */
  conditionIds?: string[];
  /** Optional: callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Connect to Polymarket's WebSocket for real-time trade feed.
 * Filters trades by USD threshold and fires onAlert for matches.
 * Returns a close() function to disconnect.
 */
export function connectWhaleWs(config: WhaleWsConfig): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  const seen = new Set<string>(); // Deduplication (last 1000 trades)

  function connect() {
    if (closed) return;

    try {
      ws = new WebSocket(POLYMARKET_APIS.WS);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      config.onConnectionChange?.(true);

      // Subscribe to market channel
      if (config.conditionIds?.length) {
        for (const id of config.conditionIds) {
          ws?.send(JSON.stringify({ type: 'subscribe', channel: 'market', market: id }));
        }
      } else {
        ws?.send(JSON.stringify({ type: 'subscribe', channel: 'market' }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : '');
        if (!data || !Array.isArray(data)) return;

        for (const msg of data) {
          if (msg.event_type !== 'trade' && msg.type !== 'trade') continue;

          const price = parseFloat(msg.price || '0');
          const size = parseFloat(msg.size || msg.amount || '0');
          const usdValue = price * size;

          if (usdValue < config.minUsdValue) continue;

          // Dedup
          const tradeId = `${msg.id || msg.taker_order_id || ''}:${msg.timestamp || Date.now()}`;
          if (seen.has(tradeId)) continue;
          seen.add(tradeId);
          if (seen.size > 1000) {
            const first = seen.values().next().value;
            if (first) seen.delete(first);
          }

          // Optional condition filter
          if (config.conditionIds?.length && msg.market && !config.conditionIds.includes(msg.market)) {
            continue;
          }

          const alert: PolymarketWhaleAlert = {
            id: tradeId,
            timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
            market: msg.question || msg.market || 'Unknown',
            conditionId: msg.market || msg.conditionId || '',
            outcome: msg.outcome || (msg.side === 'BUY' ? 'Yes' : 'No'),
            side: msg.side === 'SELL' || msg.side === 1 ? 'SELL' : 'BUY',
            size,
            price,
            usdValue,
            maker: msg.maker || msg.owner || msg.taker || '',
          };

          config.onAlert(alert);
        }
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
