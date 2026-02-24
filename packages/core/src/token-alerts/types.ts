/**
 * Token Alerts — types for PumpFun new token stream.
 */

/** Raw event from PumpPortal WebSocket */
export interface PumpPortalNewTokenEvent {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'create';
  initialBuy: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  name: string;
  symbol: string;
  uri: string;
}

/** Processed alert with enriched data */
export interface NewTokenAlert {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  initialBuySol: number;
  marketCapSol: number;
  bondingCurveKey: string;
  metadataUri: string;
  imageUrl?: string;
  timestamp: number;
  signature: string;
}

/** WebSocket client config */
export interface TokenStreamConfig {
  onAlert: (alert: NewTokenAlert) => void;
  onConnectionChange?: (connected: boolean) => void;
  /** Max alerts to keep in dedup buffer (default: 500) */
  bufferSize?: number;
}

/** Filter criteria for token alerts */
export interface TokenAlertFilter {
  minMarketCapSol?: number;
  maxMarketCapSol?: number;
  minInitialBuySol?: number;
  nameKeyword?: string;
}

export const PUMPPORTAL_WS_URL = 'wss://pumpportal.fun/api/data';
