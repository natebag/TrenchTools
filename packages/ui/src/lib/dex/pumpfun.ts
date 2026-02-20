/**
 * PumpFun DEX implementation
 *
 * Uses on-chain bonding curve state for quotes and the PumpPortal API
 * (https://pumpportal.fun/api/trade-local) for transaction building.
 * This is the same pattern as Jupiter: API builds the transaction,
 * we sign it locally and send via our own RPC.
 *
 * Bonding curve math (for quotes):
 * - Buy: tokensOut = (virtualTokenReserves * solIn) / (virtualSolReserves + solIn)
 * - Sell: solOut = (virtualSolReserves * tokenIn) / (virtualTokenReserves + tokenIn)
 * - 1% fee on all trades
 */

import {
  Connection,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import type { DexSwapper, Quote, SwapResult, DexConfig } from './types';

// ============ Constants ============

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPPORTAL_API_URL = 'https://pumpportal.fun/api/trade-local';
const WSOL = 'So11111111111111111111111111111111111111112';

// ============ Bonding Curve (for quotes) ============

export function getBondingCurveAddress(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBytes()],
    PUMPFUN_PROGRAM_ID
  );
  return pda;
}

interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

function parseBondingCurveState(data: Buffer): BondingCurveState | null {
  if (data.length < 49) return null;
  const offset = 8; // Skip Anchor discriminator
  return {
    virtualTokenReserves: data.readBigUInt64LE(offset),
    virtualSolReserves: data.readBigUInt64LE(offset + 8),
    realTokenReserves: data.readBigUInt64LE(offset + 16),
    realSolReserves: data.readBigUInt64LE(offset + 24),
    tokenTotalSupply: data.readBigUInt64LE(offset + 32),
    complete: data.readUInt8(offset + 40) === 1,
  };
}

async function fetchBondingCurveState(
  connection: Connection,
  bondingCurve: PublicKey
): Promise<BondingCurveState | null> {
  const accountInfo = await connection.getAccountInfo(bondingCurve);
  if (!accountInfo || !accountInfo.data) return null;
  return parseBondingCurveState(accountInfo.data as Buffer);
}

function calculateSwapOutput(
  inputAmount: bigint,
  isBuying: boolean,
  state: BondingCurveState,
  slippageBps: number
): { outAmount: bigint; minOutAmount: bigint; priceImpact: number } {
  // 1% fee
  const inputAfterFee = inputAmount - (inputAmount * 100n / 10000n);

  let outputAmount: bigint;
  let priceImpact: number;

  if (isBuying) {
    const numerator = state.virtualTokenReserves * inputAfterFee;
    const denominator = state.virtualSolReserves + inputAfterFee;
    outputAmount = numerator / denominator;

    const spotPrice = Number(state.virtualTokenReserves) / Number(state.virtualSolReserves);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);
  } else {
    const numerator = state.virtualSolReserves * inputAfterFee;
    const denominator = state.virtualTokenReserves + inputAfterFee;
    outputAmount = numerator / denominator;

    const spotPrice = Number(state.virtualSolReserves) / Number(state.virtualTokenReserves);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);
  }

  const minOutputAmount = (outputAmount * BigInt(10000 - slippageBps)) / 10000n;

  return { outAmount: outputAmount, minOutAmount: minOutputAmount, priceImpact };
}

// ============ DexSwapper Implementation ============

export const pumpfunSwapper: DexSwapper = {
  name: 'PumpFun',
  type: 'pumpfun',
  isImplemented: true,

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    config: DexConfig
  ): Promise<Quote> {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const slippageBps = config.slippageBps ?? 500;

    const isBuying = inputMint === WSOL;
    const tokenMintStr = isBuying ? outputMint : inputMint;
    const tokenMint = new PublicKey(tokenMintStr);

    // Fetch bonding curve state for quote calculation
    const bondingCurve = getBondingCurveAddress(tokenMint);
    const curveState = await fetchBondingCurveState(connection, bondingCurve);

    if (!curveState) {
      throw new Error(`Token ${tokenMintStr.slice(0, 8)}... not found on PumpFun bonding curve`);
    }

    if (curveState.complete) {
      throw new Error(`Token ${tokenMintStr.slice(0, 8)}... has graduated — use Jupiter instead`);
    }

    const result = calculateSwapOutput(BigInt(amount), isBuying, curveState, slippageBps);

    return {
      dex: 'pumpfun',
      inputMint,
      outputMint,
      inputAmount: amount,
      outputAmount: Number(result.outAmount),
      priceImpactPct: result.priceImpact,
      slippageBps,
      raw: {
        tokenMint: tokenMintStr,
        isBuying,
        // For API: amount in SOL (for buys) or tokens (for sells)
        solAmountLamports: isBuying ? amount : Number(result.outAmount),
        tokenAmount: isBuying ? Number(result.outAmount) : amount,
      },
    };
  },

  async executeSwap(
    quote: Quote,
    wallet: Keypair,
    config: DexConfig
  ): Promise<SwapResult> {
    const walletAddress = wallet.publicKey.toBase58();
    const truncatedWallet = walletAddress.slice(0, 8) + '...';

    try {
      const connection = new Connection(config.rpcUrl, 'confirmed');
      const raw = quote.raw as {
        tokenMint: string;
        isBuying: boolean;
        solAmountLamports: number;
        tokenAmount: number;
      };

      // Convert slippage from bps to percentage for PumpPortal API
      const slippagePercent = (quote.slippageBps ?? 500) / 100;

      // For buys: cap the SOL amount to leave room for rent + fees
      let buyAmountSol = raw.solAmountLamports / LAMPORTS_PER_SOL;
      if (raw.isBuying) {
        const balance = await connection.getBalance(wallet.publicKey, 'confirmed');
        const balanceSol = balance / LAMPORTS_PER_SOL;
        // Reserve 0.01 SOL for rent-exempt minimum + tx fees + priority fee
        const maxSpendable = balanceSol - 0.01;
        if (maxSpendable <= 0) {
          throw new Error(`Wallet has only ${balanceSol.toFixed(4)} SOL — need at least 0.01 SOL reserve for rent/fees`);
        }
        buyAmountSol = Math.min(buyAmountSol, maxSpendable);
      }

      // For sells: PumpPortal expects token amount in human-readable units,
      // not raw smallest-denomination. PumpFun tokens always have 6 decimals.
      const sellTokenAmount = raw.tokenAmount / 1_000_000;

      // Use PumpPortal API to build the transaction (same pattern as Jupiter)
      const response = await fetch(PUMPPORTAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: walletAddress,
          action: raw.isBuying ? 'buy' : 'sell',
          mint: raw.tokenMint,
          amount: raw.isBuying ? buyAmountSol : sellTokenAmount,
          denominatedInSol: raw.isBuying ? 'true' : 'false',
          slippage: slippagePercent,
          priorityFee: 0.00001,
          pool: 'pump',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PumpPortal API failed (${response.status}): ${errorText}`);
      }

      // Response is raw bytes of a VersionedTransaction
      const txBytes = new Uint8Array(await response.arrayBuffer());
      const tx = VersionedTransaction.deserialize(txBytes);

      // Sign with wallet
      tx.sign([wallet]);

      // Send transaction
      const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirmation check — poll for on-chain status before returning success
      let txConfirmed = false;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2500));
        const statusResp = await connection.getSignatureStatuses([signature]);
        const status = statusResp.value[0];
        if (status) {
          if (status.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            txConfirmed = true;
            break;
          }
        }
      }
      if (!txConfirmed) {
        throw new Error(`Transaction not confirmed after 20s (sig: ${signature.slice(0, 20)}...). May have been dropped.`);
      }

      return {
        success: true,
        txHash: signature,
        wallet: truncatedWallet,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown PumpFun error',
        wallet: truncatedWallet,
        inputAmount: quote.inputAmount,
      };
    }
  },

  async supportsTokenPair(inputMint: string, outputMint: string): Promise<boolean> {
    const hasSOL = inputMint === WSOL || outputMint === WSOL;
    return hasSOL;
  },
};

export default pumpfunSwapper;
