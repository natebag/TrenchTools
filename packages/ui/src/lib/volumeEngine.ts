/**
 * Volume Engine - Real on-chain volume boosting
 * Uses Jupiter API for swaps
 */

import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';

const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';
const WSOL = 'So11111111111111111111111111111111111111112';

export interface VolumeConfig {
  targetToken: string;
  minSwapSol: number;
  maxSwapSol: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  slippageBps: number;
}

export interface SwapResult {
  success: boolean;
  type: 'buy' | 'sell';
  amount: number;
  txHash?: string;
  error?: string;
  wallet: string;
}

export class VolumeEngine {
  private connection: Connection;
  private jupiterApiKey: string;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(rpcUrl: string, jupiterApiKey: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.jupiterApiKey = jupiterApiKey;
  }

  async getQuote(inputMint: string, outputMint: string, amountLamports: number): Promise<any> {
    const url = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amountLamports),
      slippageBps: '100'
    });

    const resp = await fetch(url, {
      headers: { 'x-api-key': this.jupiterApiKey }
    });

    if (!resp.ok) {
      throw new Error(`Quote error: ${resp.status}`);
    }

    return resp.json();
  }

  async executeSwap(
    wallet: Keypair,
    inputMint: string,
    outputMint: string,
    amountLamports: number
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Get quote
      const quote = await this.getQuote(inputMint, outputMint, amountLamports);

      // Get swap transaction
      const swapResp = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.jupiterApiKey
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        })
      });

      if (!swapResp.ok) {
        throw new Error(`Swap error: ${swapResp.status}`);
      }

      const swapResult = await swapResp.json();

      // Deserialize and sign
      const swapTxBuf = Buffer.from(swapResult.swapTransaction, 'base64');
      const tx = VersionedTransaction.deserialize(swapTxBuf);
      tx.sign([wallet]);

      // Send transaction
      const signature = await this.connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3
      });

      // Wait for confirmation (with timeout)
      const confirmation = await Promise.race([
        this.connection.confirmTransaction(signature, 'confirmed'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
      ]);

      return { success: true, txHash: signature };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async executeBuy(wallet: Keypair, tokenMint: string, amountSol: number): Promise<SwapResult> {
    const result = await this.executeSwap(
      wallet,
      WSOL,
      tokenMint,
      Math.floor(amountSol * 1e9)
    );

    return {
      ...result,
      type: 'buy',
      amount: amountSol,
      wallet: wallet.publicKey.toBase58().slice(0, 8) + '...'
    };
  }

  async executeSell(wallet: Keypair, tokenMint: string, amountTokens: number): Promise<SwapResult> {
    const result = await this.executeSwap(
      wallet,
      tokenMint,
      WSOL,
      amountTokens
    );

    return {
      ...result,
      type: 'sell',
      amount: amountTokens,
      wallet: wallet.publicKey.toBase58().slice(0, 8) + '...'
    };
  }

  async getTokenBalance(wallet: PublicKey, tokenMint: string): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(wallet, {
        mint: new PublicKey(tokenMint)
      });

      if (tokenAccounts.value.length === 0) return 0;

      const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance || 0;
    } catch {
      return 0;
    }
  }
}

// Singleton instance
let engineInstance: VolumeEngine | null = null;

export function getVolumeEngine(rpcUrl: string, jupiterApiKey: string): VolumeEngine {
  if (!engineInstance) {
    engineInstance = new VolumeEngine(rpcUrl, jupiterApiKey);
  }
  return engineInstance;
}
