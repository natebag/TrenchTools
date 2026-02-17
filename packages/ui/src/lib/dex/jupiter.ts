/**
 * Jupiter DEX implementation
 * 
 * Jupiter is the primary aggregator for Solana, finding the best route
 * across all DEXs for optimal pricing.
 */

import { Connection, VersionedTransaction, Keypair, SendTransactionError } from '@solana/web3.js';
import type { DexSwapper, Quote, SwapResult, DexConfig } from './types';

const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';

export const jupiterSwapper: DexSwapper = {
  name: 'Jupiter',
  type: 'jupiter',
  isImplemented: true,

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    config: DexConfig
  ): Promise<Quote> {
    const slippageBps = config.slippageBps ?? 200;

    const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: String(slippageBps),
    });

    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }

    const response = await fetch(quoteUrl, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${errorText}`);
    }

    const quoteResponse = await response.json();

    return {
      dex: 'jupiter',
      inputMint,
      outputMint,
      inputAmount: parseInt(quoteResponse.inAmount || amount),
      outputAmount: parseInt(quoteResponse.outAmount),
      priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
      slippageBps,
      raw: quoteResponse,
    };
  },

  async executeSwap(
    quote: Quote,
    wallet: Keypair,
    config: DexConfig
  ): Promise<SwapResult> {
    const walletAddress = wallet.publicKey.toBase58();
    const truncatedWallet = walletAddress.slice(0, 8) + '...';
    const connection = new Connection(config.rpcUrl, 'confirmed');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['x-api-key'] = config.apiKey;
      }

      // Get swap transaction from Jupiter
      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          quoteResponse: quote.raw,
          userPublicKey: walletAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        throw new Error(`Jupiter swap failed (${swapResponse.status}): ${errorText}`);
      }

      const swapResult = await swapResponse.json();

      // Deserialize and sign transaction
      const swapTxBuf = Buffer.from(swapResult.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(swapTxBuf);
      tx.sign([wallet]);

      // Send transaction
      const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      return {
        success: true,
        txHash: signature,
        wallet: truncatedWallet,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof SendTransactionError) {
        try {
          const logs = await error.getLogs(connection);
          if (logs?.length) {
            errorMessage = `${errorMessage}\nLogs: ${JSON.stringify(logs)}`;
          }
        } catch {
          // If log fetch fails, keep the original error message.
        }
      }

      return {
        success: false,
        error: errorMessage,
        wallet: truncatedWallet,
        inputAmount: quote.inputAmount,
      };
    }
  },

  async supportsTokenPair(inputMint: string, outputMint: string): Promise<boolean> {
    // Jupiter supports almost all Solana tokens
    // Could add a check against their token list API if needed
    return inputMint !== outputMint;
  },
};

export default jupiterSwapper;
