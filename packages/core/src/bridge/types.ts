/**
 * Cross-chain bridge types and Li.Fi chain mappings.
 */

import type { ChainId } from '../chains/types.js';

// ── Li.Fi Chain Mappings ──

export type LifiChainKey = 'SOL' | 'BSC' | 'BAS' | 'POL' | 'SUI';

export const LIFI_CHAIN_MAP: Record<ChainId, LifiChainKey> = {
  solana: 'SOL',
  bsc: 'BSC',
  base: 'BAS',
  polygon: 'POL',
  sui: 'SUI',
};

export const LIFI_CHAIN_REVERSE: Record<LifiChainKey, ChainId> = {
  SOL: 'solana',
  BSC: 'bsc',
  BAS: 'base',
  POL: 'polygon',
  SUI: 'sui',
};

/** Native token addresses per Li.Fi conventions */
export const LIFI_NATIVE_TOKENS: Record<ChainId, string> = {
  solana: '11111111111111111111111111111111',
  bsc: '0x0000000000000000000000000000000000000000',
  base: '0x0000000000000000000000000000000000000000',
  polygon: '0x0000000000000000000000000000000000000000',
  sui: '0x2::sui::SUI',
};

// ── Quote Types ──

export interface BridgeQuoteRequest {
  fromChain: ChainId;
  toChain: ChainId;
  /** Raw amount in smallest unit (lamports, wei, mist) */
  fromAmount: string;
  fromAddress: string;
  toAddress: string;
  /** Token address on source chain. Defaults to native. */
  fromToken?: string;
  /** Token address on dest chain. Defaults to native. */
  toToken?: string;
}

export interface BridgeFeeCost {
  name: string;
  amount: string;
  amountUSD: string;
  token: { symbol: string; decimals: number };
}

export interface BridgeQuoteEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  executionDurationSeconds: number;
  feeCosts: BridgeFeeCost[];
  gasCosts: BridgeFeeCost[];
}

export interface BridgeQuote {
  id: string;
  fromChain: ChainId;
  toChain: ChainId;
  estimate: BridgeQuoteEstimate;
  /** Raw transaction data from Li.Fi — format varies by chain */
  transactionRequest: Record<string, unknown>;
  /** Bridge protocol used (e.g., "allbridge", "mayan", "wormhole") */
  tool: string;
  toolDetails?: { name: string; logoURI?: string };
}

// ── Status Types ──

export enum BridgeStatus {
  NOT_FOUND = 'NOT_FOUND',
  PENDING = 'PENDING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export const BRIDGE_STATUS_LABELS: Record<BridgeStatus, string> = {
  [BridgeStatus.NOT_FOUND]: 'Not Found',
  [BridgeStatus.PENDING]: 'In Progress',
  [BridgeStatus.DONE]: 'Complete',
  [BridgeStatus.FAILED]: 'Failed',
};

export interface BridgeStatusResponse {
  status: BridgeStatus;
  substatus?: string;
  substatusMessage?: string;
  sending?: { txHash: string; amount: string };
  receiving?: { txHash: string; amount: string };
}

// ── Result Types ──

export interface BridgeResult {
  success: boolean;
  txHash?: string;
  error?: string;
  receiveTxHash?: string;
  amountReceived?: string;
  durationMs?: number;
}

export type BridgeProgressCallback = (status: BridgeStatusResponse) => void;
