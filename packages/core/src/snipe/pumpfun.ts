/**
 * PumpFun Bonding Curve Integration
 * TrenchSniper OS - Direct PumpFun DEX Integration
 * 
 * PumpFun uses a bonding curve model where:
 * - Tokens start on PumpFun's bonding curve
 * - When market cap reaches ~$69k, liquidity migrates to Raydium
 * - Price is determined by the bonding curve formula
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

// ============ PumpFun Constants ============

export const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const PUMPFUN_FEE_ACCOUNT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// PumpFun tokens use 6 decimals
export const PUMPFUN_TOKEN_DECIMALS = 6;

// Migration threshold in SOL (approximately $69k market cap)
export const MIGRATION_THRESHOLD_SOL = 85_000_000_000n; // ~85 SOL in bonding curve

// Bonding curve constants
export const INITIAL_VIRTUAL_TOKEN_RESERVES = BigInt(1_073_000_000_000_000); // ~1.073B tokens
export const INITIAL_VIRTUAL_SOL_RESERVES = BigInt(30_000_000_000); // 30 SOL

// Instruction discriminators (Anchor framework)
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const SELL_DISCRIMINATOR = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);

// Quote validity
const QUOTE_VALIDITY_MS = 30000;

// ============ Types ============

export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

export interface PumpFunQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  minOutAmount: string;
  priceImpactPct: number;
  bondingCurveAddress: string;
  timestamp: number;
  expiresAt: number;
}

export interface PumpFunSwapParams {
  wallet: Keypair;
  tokenMint: PublicKey;
  amountIn: bigint;
  minAmountOut: bigint;
  isBuying: boolean;
  priorityFeeLamports?: number;
}

export interface PumpFunSwapResult {
  signature: string;
  inputAmount: bigint;
  outputAmount: bigint;
  slot: number;
  timestamp: number;
}

export interface TokenInfo {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  isComplete: boolean;
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  currentPrice: number;
  marketCapSol: number;
}

// ============ Error Classes ============

export class PumpFunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PumpFunError';
  }
}

export class TokenNotFoundError extends PumpFunError {
  constructor(mint: string) {
    super(`Token ${mint} not found on PumpFun bonding curve`);
    this.name = 'TokenNotFoundError';
  }
}

export class TokenMigratedError extends PumpFunError {
  constructor(mint: string) {
    super(`Token ${mint} has already migrated to Raydium`);
    this.name = 'TokenMigratedError';
  }
}

export class InsufficientLiquidityError extends PumpFunError {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientLiquidityError';
  }
}

// ============ PumpFun Client ============

export class PumpFunClient {
  constructor(private readonly connection: Connection) {}

  /**
   * Derive bonding curve address from token mint.
   */
  getBondingCurveAddress(mintAddress: PublicKey): PublicKey {
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mintAddress.toBytes()],
      PUMPFUN_PROGRAM_ID
    );
    return bondingCurve;
  }

  /**
   * Get global config PDA.
   */
  getGlobalConfigAddress(): PublicKey {
    const [globalConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('global')],
      PUMPFUN_PROGRAM_ID
    );
    return globalConfig;
  }

  /**
   * Get event authority PDA.
   */
  getEventAuthorityAddress(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('__event_authority')],
      PUMPFUN_PROGRAM_ID
    );
    return eventAuthority;
  }

  /**
   * Fetch bonding curve state from chain.
   */
  async getBondingCurveState(
    bondingCurve: PublicKey
  ): Promise<BondingCurveState | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(bondingCurve);

      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      const data = accountInfo.data;
      if (data.length < 49) {
        return null;
      }

      // Skip 8-byte anchor discriminator
      const offset = 8;

      return {
        virtualTokenReserves: data.readBigUInt64LE(offset),
        virtualSolReserves: data.readBigUInt64LE(offset + 8),
        realTokenReserves: data.readBigUInt64LE(offset + 16),
        realSolReserves: data.readBigUInt64LE(offset + 24),
        tokenTotalSupply: data.readBigUInt64LE(offset + 32),
        complete: data.readUInt8(offset + 40) === 1,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get full token info including calculated fields.
   */
  async getTokenInfo(tokenMint: PublicKey): Promise<TokenInfo | null> {
    const bondingCurve = this.getBondingCurveAddress(tokenMint);
    const curveState = await this.getBondingCurveState(bondingCurve);

    if (!curveState) {
      return null;
    }

    const associatedBondingCurve = await getAssociatedTokenAddress(
      tokenMint,
      bondingCurve,
      true
    );

    // Calculate current price (SOL per token)
    const currentPrice = Number(curveState.virtualSolReserves) / 
      Number(curveState.virtualTokenReserves) / LAMPORTS_PER_SOL;

    // Calculate market cap in SOL
    const marketCapSol = Number(curveState.realSolReserves) / LAMPORTS_PER_SOL;

    return {
      mint: tokenMint,
      bondingCurve,
      associatedBondingCurve,
      isComplete: curveState.complete,
      virtualTokenReserves: curveState.virtualTokenReserves,
      virtualSolReserves: curveState.virtualSolReserves,
      currentPrice,
      marketCapSol,
    };
  }

  /**
   * Check if a token is on PumpFun (not migrated).
   */
  async isOnPumpFun(tokenMint: PublicKey): Promise<boolean> {
    const curveState = await this.getBondingCurveState(
      this.getBondingCurveAddress(tokenMint)
    );
    return curveState !== null && !curveState.complete;
  }

  /**
   * Check if a token has migrated to Raydium.
   */
  async hasMigrated(tokenMint: PublicKey): Promise<boolean> {
    const curveState = await this.getBondingCurveState(
      this.getBondingCurveAddress(tokenMint)
    );
    return curveState !== null && curveState.complete;
  }

  /**
   * Calculate swap output using bonding curve math.
   * PumpFun uses constant product formula with virtual reserves.
   */
  calculateSwapOutput(
    inputAmount: bigint,
    isBuying: boolean,
    state: BondingCurveState,
    slippageBps: number = 100
  ): { outAmount: bigint; minOutAmount: bigint; priceImpact: number } {
    // 1% fee on all trades
    const feeRate = BigInt(100);
    const feeDenominator = BigInt(10000);
    const inputAfterFee = inputAmount - (inputAmount * feeRate / feeDenominator);

    let outputAmount: bigint;
    let priceImpact: number;

    if (isBuying) {
      // Buying tokens with SOL
      // Formula: tokens_out = (virtual_token * sol_in) / (virtual_sol + sol_in)
      const numerator = state.virtualTokenReserves * inputAfterFee;
      const denominator = state.virtualSolReserves + inputAfterFee;
      outputAmount = numerator / denominator;

      const spotPrice = Number(state.virtualTokenReserves) / Number(state.virtualSolReserves);
      const executionPrice = Number(outputAmount) / Number(inputAfterFee);
      priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);
    } else {
      // Selling tokens for SOL
      // Formula: sol_out = (virtual_sol * token_in) / (virtual_token + token_in)
      const numerator = state.virtualSolReserves * inputAfterFee;
      const denominator = state.virtualTokenReserves + inputAfterFee;
      outputAmount = numerator / denominator;

      const spotPrice = Number(state.virtualSolReserves) / Number(state.virtualTokenReserves);
      const executionPrice = Number(outputAmount) / Number(inputAfterFee);
      priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice * 100);
    }

    // Apply slippage for minimum output
    const slippageMultiplier = BigInt(10000 - slippageBps);
    const minOutputAmount = (outputAmount * slippageMultiplier) / BigInt(10000);

    return {
      outAmount: outputAmount,
      minOutAmount: minOutputAmount,
      priceImpact,
    };
  }

  /**
   * Get swap quote.
   */
  async getQuote(
    tokenMint: PublicKey,
    amountIn: bigint,
    isBuying: boolean,
    slippageBps: number = 100
  ): Promise<PumpFunQuote> {
    const bondingCurve = this.getBondingCurveAddress(tokenMint);
    const curveState = await this.getBondingCurveState(bondingCurve);

    if (!curveState) {
      throw new TokenNotFoundError(tokenMint.toString());
    }

    if (curveState.complete) {
      throw new TokenMigratedError(tokenMint.toString());
    }

    const result = this.calculateSwapOutput(amountIn, isBuying, curveState, slippageBps);
    const now = Date.now();

    return {
      inputMint: isBuying ? SOL_MINT.toString() : tokenMint.toString(),
      outputMint: isBuying ? tokenMint.toString() : SOL_MINT.toString(),
      inAmount: amountIn.toString(),
      outAmount: result.outAmount.toString(),
      minOutAmount: result.minOutAmount.toString(),
      priceImpactPct: result.priceImpact,
      bondingCurveAddress: bondingCurve.toString(),
      timestamp: now,
      expiresAt: now + QUOTE_VALIDITY_MS,
    };
  }

  /**
   * Build buy instruction.
   */
  buildBuyInstruction(
    user: PublicKey,
    tokenMint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    userTokenAccount: PublicKey,
    solAmount: bigint,
    minTokensOut: bigint
  ): TransactionInstruction {
    const data = Buffer.alloc(8 + 8 + 8);
    BUY_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(minTokensOut, 8);
    data.writeBigUInt64LE(solAmount, 16);

    const keys = [
      { pubkey: this.getGlobalConfigAddress(), isSigner: false, isWritable: false },
      { pubkey: PUMPFUN_FEE_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: this.getEventAuthorityAddress(), isSigner: false, isWritable: false },
      { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build sell instruction.
   */
  buildSellInstruction(
    user: PublicKey,
    tokenMint: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    userTokenAccount: PublicKey,
    tokenAmount: bigint,
    minSolOut: bigint
  ): TransactionInstruction {
    const data = Buffer.alloc(8 + 8 + 8);
    SELL_DISCRIMINATOR.copy(data, 0);
    data.writeBigUInt64LE(tokenAmount, 8);
    data.writeBigUInt64LE(minSolOut, 16);

    const keys = [
      { pubkey: this.getGlobalConfigAddress(), isSigner: false, isWritable: false },
      { pubkey: PUMPFUN_FEE_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: this.getEventAuthorityAddress(), isSigner: false, isWritable: false },
      { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: PUMPFUN_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build complete swap transaction.
   */
  async buildSwapTransaction(
    params: PumpFunSwapParams
  ): Promise<Transaction> {
    const { wallet, tokenMint, amountIn, minAmountOut, isBuying, priorityFeeLamports: _priorityFeeLamports } = params;
    const transaction = new Transaction();

    const bondingCurve = this.getBondingCurveAddress(tokenMint);
    const associatedBondingCurve = await getAssociatedTokenAddress(
      tokenMint,
      bondingCurve,
      true
    );

    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      wallet.publicKey
    );

    // Create ATA if buying and doesn't exist
    if (isBuying) {
      const tokenAccountInfo = await this.connection.getAccountInfo(userTokenAccount);
      if (!tokenAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userTokenAccount,
            wallet.publicKey,
            tokenMint
          )
        );
      }
    }

    // Add swap instruction
    const swapInstruction = isBuying
      ? this.buildBuyInstruction(
          wallet.publicKey,
          tokenMint,
          bondingCurve,
          associatedBondingCurve,
          userTokenAccount,
          amountIn,
          minAmountOut
        )
      : this.buildSellInstruction(
          wallet.publicKey,
          tokenMint,
          bondingCurve,
          associatedBondingCurve,
          userTokenAccount,
          amountIn,
          minAmountOut
        );

    transaction.add(swapInstruction);

    // Set transaction metadata
    const { blockhash, lastValidBlockHeight } = 
      await this.connection.getLatestBlockhash('confirmed');

    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = wallet.publicKey;

    return transaction;
  }

  /**
   * Execute swap on PumpFun.
   */
  async swap(params: PumpFunSwapParams): Promise<PumpFunSwapResult> {
    // Verify token is on bonding curve
    const curveState = await this.getBondingCurveState(
      this.getBondingCurveAddress(params.tokenMint)
    );

    if (!curveState) {
      throw new TokenNotFoundError(params.tokenMint.toString());
    }

    if (curveState.complete) {
      throw new TokenMigratedError(params.tokenMint.toString());
    }

    // Build and sign transaction
    const transaction = await this.buildSwapTransaction(params);
    transaction.sign(params.wallet);

    // Send and confirm
    const signature = await this.connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 2,
      }
    );

    const confirmation = await this.connection.confirmTransaction(
      signature,
      'confirmed'
    );

    if (confirmation.value.err) {
      throw new PumpFunError(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      );
    }

    return {
      signature,
      inputAmount: params.amountIn,
      outputAmount: params.minAmountOut, // Actual amount may differ
      slot: confirmation.context.slot,
      timestamp: Date.now(),
    };
  }

  /**
   * Buy tokens with SOL.
   */
  async buy(
    wallet: Keypair,
    tokenMint: PublicKey,
    solAmount: bigint,
    slippageBps: number = 100
  ): Promise<PumpFunSwapResult> {
    const quote = await this.getQuote(tokenMint, solAmount, true, slippageBps);

    return this.swap({
      wallet,
      tokenMint,
      amountIn: solAmount,
      minAmountOut: BigInt(quote.minOutAmount),
      isBuying: true,
    });
  }

  /**
   * Sell tokens for SOL.
   */
  async sell(
    wallet: Keypair,
    tokenMint: PublicKey,
    tokenAmount: bigint,
    slippageBps: number = 100
  ): Promise<PumpFunSwapResult> {
    const quote = await this.getQuote(tokenMint, tokenAmount, false, slippageBps);

    return this.swap({
      wallet,
      tokenMint,
      amountIn: tokenAmount,
      minAmountOut: BigInt(quote.minOutAmount),
      isBuying: false,
    });
  }
}

// ============ Standalone Functions ============

let defaultClient: PumpFunClient | null = null;

function getDefaultClient(connection: Connection): PumpFunClient {
  if (!defaultClient) {
    defaultClient = new PumpFunClient(connection);
  }
  return defaultClient;
}

export async function getQuote(
  connection: Connection,
  tokenMint: PublicKey,
  amountIn: bigint,
  isBuying: boolean,
  slippageBps: number = 100
): Promise<PumpFunQuote> {
  return getDefaultClient(connection).getQuote(tokenMint, amountIn, isBuying, slippageBps);
}

export async function buy(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  solAmount: bigint,
  slippageBps: number = 100
): Promise<PumpFunSwapResult> {
  return getDefaultClient(connection).buy(wallet, tokenMint, solAmount, slippageBps);
}

export async function sell(
  connection: Connection,
  wallet: Keypair,
  tokenMint: PublicKey,
  tokenAmount: bigint,
  slippageBps: number = 100
): Promise<PumpFunSwapResult> {
  return getDefaultClient(connection).sell(wallet, tokenMint, tokenAmount, slippageBps);
}

export async function isOnPumpFun(
  connection: Connection,
  tokenMint: PublicKey
): Promise<boolean> {
  return getDefaultClient(connection).isOnPumpFun(tokenMint);
}

export async function hasMigrated(
  connection: Connection,
  tokenMint: PublicKey
): Promise<boolean> {
  return getDefaultClient(connection).hasMigrated(tokenMint);
}

export function getBondingCurveAddress(tokenMint: PublicKey): PublicKey {
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), tokenMint.toBytes()],
    PUMPFUN_PROGRAM_ID
  );
  return bondingCurve;
}

export async function getTokenInfo(
  connection: Connection,
  tokenMint: PublicKey
): Promise<TokenInfo | null> {
  return getDefaultClient(connection).getTokenInfo(tokenMint);
}

// Export constants
export const PUMPFUN_CONSTANTS = {
  PROGRAM_ID: PUMPFUN_PROGRAM_ID,
  FEE_ACCOUNT: PUMPFUN_FEE_ACCOUNT,
  SOL_MINT,
  TOKEN_DECIMALS: PUMPFUN_TOKEN_DECIMALS,
  MIGRATION_THRESHOLD_SOL,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  INITIAL_VIRTUAL_SOL_RESERVES,
};
