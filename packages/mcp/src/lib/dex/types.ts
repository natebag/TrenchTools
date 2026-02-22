/**
 * Common DEX interface types for multi-DEX support
 */

import { Keypair } from '@solana/web3.js';

export interface Quote {
  dex: DexType;
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  priceImpactPct: number;
  slippageBps: number;
  raw: unknown;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  error?: string;
  wallet: string;
  inputAmount: number;
  outputAmount?: number;
}

export type DexType = 'jupiter' | 'pumpfun';

export interface DexConfig {
  rpcUrl: string;
  apiKey?: string;          // Jupiter API key
  slippageBps?: number;
  heliusApiKey?: string;
  // Hosted mode fields
  hostedApiUrl?: string;    // Hosted API URL (e.g. https://app.trenchtools.com)
  hostedApiKey?: string;    // Hosted API key (trench_sk_...)
  feeAccount?: string;      // Fee collection wallet address
  feeBps?: number;           // Fee basis points
}

export interface DexSwapper {
  name: string;
  type: DexType;
  isImplemented: boolean;
  getQuote(inputMint: string, outputMint: string, amount: number, config: DexConfig): Promise<Quote>;
  executeSwap(quote: Quote, wallet: Keypair, config: DexConfig): Promise<SwapResult>;
  supportsTokenPair?(inputMint: string, outputMint: string): Promise<boolean>;
}

export const KNOWN_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;
