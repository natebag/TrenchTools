/**
 * Jupiter DEX implementation
 */

import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js';
import type { DexSwapper, Quote, SwapResult, DexConfig } from './types.js';

const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';

export async function getHeliusPriorityFee(heliusApiKey: string): Promise<number | null> {
  try {
    const resp = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'priority-fee',
        method: 'getPriorityFeeEstimate',
        params: [{ options: { priorityLevel: 'High' } }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { result?: { priorityFeeEstimate?: number } };
    const fee = data?.result?.priorityFeeEstimate;
    return typeof fee === 'number' ? fee : null;
  } catch {
    return null;
  }
}

export const jupiterSwapper: DexSwapper = {
  name: 'Jupiter',
  type: 'jupiter',
  isImplemented: true,

  async getQuote(inputMint, outputMint, amount, config): Promise<Quote> {
    const slippageBps = config.slippageBps ?? 200;
    const quoteUrl = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
      inputMint, outputMint, amount: String(amount), slippageBps: String(slippageBps),
    });
    const headers: Record<string, string> = {};
    if (config.apiKey) headers['x-api-key'] = config.apiKey;
    const response = await fetch(quoteUrl, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${errorText}`);
    }
    const quoteResponse = await response.json() as { inAmount?: string; outAmount: string; priceImpactPct?: string };
    return {
      dex: 'jupiter', inputMint, outputMint,
      inputAmount: parseInt(quoteResponse.inAmount || String(amount)),
      outputAmount: parseInt(quoteResponse.outAmount),
      priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
      slippageBps, raw: quoteResponse,
    };
  },

  async executeSwap(quote, wallet, config): Promise<SwapResult> {
    const walletAddress = wallet.publicKey.toBase58();
    const truncatedWallet = walletAddress.slice(0, 8) + '...';
    try {
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['x-api-key'] = config.apiKey;
      let prioritizationFeeLamports: string | number = 'auto';
      if (config.heliusApiKey) {
        const heliusFee = await getHeliusPriorityFee(config.heliusApiKey);
        if (heliusFee !== null) prioritizationFeeLamports = heliusFee;
      }
      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST', headers,
        body: JSON.stringify({
          quoteResponse: quote.raw, userPublicKey: walletAddress,
          wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports,
        }),
      });
      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        throw new Error(`Jupiter swap failed (${swapResponse.status}): ${errorText}`);
      }
      const swapResult = await swapResponse.json() as { swapTransaction: string };
      const swapTxBuf = Buffer.from(swapResult.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(swapTxBuf);
      tx.sign([wallet]);
      const signature = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
      // Poll confirmation
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statusResp = await connection.getSignatureStatuses([signature]);
        const status = statusResp.value[0];
        if (status) {
          if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            return { success: true, txHash: signature, wallet: truncatedWallet, inputAmount: quote.inputAmount, outputAmount: quote.outputAmount };
          }
        }
      }
      throw new Error(`Transaction not confirmed after 20s`);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', wallet: truncatedWallet, inputAmount: quote.inputAmount };
    }
  },
};
