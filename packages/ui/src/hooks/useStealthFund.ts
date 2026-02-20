/**
 * useStealthFund — React hook for ChangeNow stealth funding lifecycle.
 *
 * Flow:
 *   1. One Jupiter swap: SOL -> USDC (treasury-side, full batch amount)
 *   2. Split USDC proportionally across destinations
 *   3. For each destination: create ChangeNow exchange (USDC -> SOL),
 *      send USDC deposit, poll status until terminal
 *
 * Supports batch funding with concurrency limit (5) and progress tracking.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import {
  ChangeNowClient,
  ChangeNowStatus,
  CHANGENOW_STATUS_LABELS,
} from '@/lib/changenow';

// ── Types ──

export interface StealthExchangeState {
  walletAddress: string;
  label: string;
  status: ChangeNowStatus;
  statusLabel: string;
  estimatedReceive: number;
  fee: number;
  exchangeId?: string;
  depositTxHash?: string;
  error?: string;
}

export interface StealthFundState {
  isQuoting: boolean;
  isFunding: boolean;
  exchanges: StealthExchangeState[];
  completedCount: number;
  failedCount: number;
  error: string | null;
}

export interface StealthDestination {
  address: string;
  label: string;
  amountSol: number;
}

// ── Constants ──

const POLL_INTERVAL = 10_000;
const TIMEOUT_MS = 15 * 60 * 1000;

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT_STR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_URL = 'https://quote-api.jup.ag/v6/swap';

// ── Inline SPL helpers (no @solana/spl-token) ──

/** Derive the Associated Token Account address for a given owner + mint. */
function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** Build a CreateAssociatedTokenAccount instruction (inline). */
function createAtaInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

/** Build an SPL Token Transfer instruction (inline). */
function createSplTransferIx(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint | number,
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0); // Transfer instruction index
  data.writeBigUInt64LE(BigInt(amount), 1);

  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

// ── Jupiter SOL -> USDC swap helper ──

/**
 * Swap SOL -> USDC on a treasury keypair via Jupiter.
 * Returns the USDC amount received (raw integer, 6 decimals).
 */
async function swapSolToUsdc(
  connection: Connection,
  fromKeypair: Keypair,
  amountSol: number,
): Promise<number> {
  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  const walletAddress = fromKeypair.publicKey.toBase58();

  const headers: Record<string, string> = {};
  const jupiterApiKey = localStorage.getItem('jupiter_api_key') || '';
  if (jupiterApiKey) {
    headers['x-api-key'] = jupiterApiKey;
  }

  // 1. Get quote: SOL -> USDC
  const quoteParams = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: USDC_MINT_STR,
    amount: String(lamports),
    slippageBps: '50',
  });

  const quoteResp = await fetch(`${JUPITER_QUOTE_URL}?${quoteParams}`, { headers });
  if (!quoteResp.ok) {
    const text = await quoteResp.text();
    throw new Error(`Jupiter quote failed: ${text}`);
  }
  const quoteResponse = await quoteResp.json() as Record<string, unknown>;

  // 2. Get swap transaction
  const swapResp = await fetch(JUPITER_SWAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: walletAddress,
      wrapAndUnwrapSol: true,
    }),
  });

  if (!swapResp.ok) {
    const text = await swapResp.text();
    throw new Error(`Jupiter swap failed: ${text}`);
  }

  const swapResult = await swapResp.json() as Record<string, unknown>;

  // 3. Deserialize, sign, and send
  const txBuf = Buffer.from(swapResult.swapTransaction as string, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([fromKeypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });

  // 4. Wait for confirmation via getSignatureStatuses polling
  await waitForConfirmation(connection, signature);

  // 5. Return USDC amount from quote (raw, 6 decimals)
  const usdcReceived = parseInt(String(quoteResponse.outAmount ?? '0'), 10);
  if (usdcReceived <= 0) {
    throw new Error('Jupiter swap returned 0 USDC');
  }

  return usdcReceived;
}

// ── Shared helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll getSignatureStatuses until confirmed/finalized.
 * Does not use confirmTransaction (blockhash expires with proxy latency).
 */
async function waitForConfirmation(connection: Connection, signature: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    const statusResp = await connection.getSignatureStatuses([signature]);
    const status = statusResp.value[0];
    if (status) {
      if (status.err) throw new Error(`TX failed on-chain: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return;
      }
    }
  }
}

/**
 * Get or create an Associated Token Account for a given owner + mint.
 */
async function getOrCreateAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = deriveAta(owner, mint);

  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo !== null) return ata;

  const ix = createAtaInstruction(payer.publicKey, ata, owner, mint);
  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await sleep(2000);

  return ata;
}

// ── Main hook ──

export function useStealthFund(rpcUrl: string) {
  const [state, setState] = useState<StealthFundState>({
    isQuoting: false,
    isFunding: false,
    exchanges: [],
    completedCount: 0,
    failedCount: 0,
    error: null,
  });
  const abortRef = useRef(false);

  const getQuote = useCallback(async (amountSol: number) => {
    setState((s) => ({ ...s, isQuoting: true, error: null }));
    try {
      const client = new ChangeNowClient();
      const estimate = await client.getEstimate(amountSol);
      setState((s) => ({ ...s, isQuoting: false }));
      return estimate;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quote failed';
      setState((s) => ({ ...s, isQuoting: false, error: msg }));
      return null;
    }
  }, []);

  /**
   * Fund destinations via stealth path:
   *   1. One Jupiter swap: total SOL -> USDC
   *   2. Split USDC proportionally across destinations
   *   3. For each: create ChangeNow exchange, send USDC deposit, poll until done
   */
  const fundStealth = useCallback(
    async (
      fromKeypair: Keypair,
      destinations: StealthDestination[],
      onComplete?: () => void,
    ) => {
      abortRef.current = false;
      const connection = new Connection(rpcUrl, 'confirmed');
      const client = new ChangeNowClient();

      // Initialize exchange states
      const initial: StealthExchangeState[] = destinations.map((d) => ({
        walletAddress: d.address,
        label: d.label,
        status: ChangeNowStatus.NEW,
        statusLabel: 'Queued',
        estimatedReceive: d.amountSol * 0.99,
        fee: d.amountSol * 0.01,
      }));

      setState({
        isQuoting: false,
        isFunding: true,
        exchanges: initial,
        completedCount: 0,
        failedCount: 0,
        error: null,
      });

      let completedCount = 0;
      let failedCount = 0;

      // 1. Calculate total SOL needed
      const totalSol = destinations.reduce((sum, d) => sum + d.amountSol, 0);

      // 2. One Jupiter swap: SOL -> USDC
      let totalUsdcRaw: number;
      try {
        totalUsdcRaw = await swapSolToUsdc(connection, fromKeypair, totalSol);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Jupiter SOL->USDC swap failed';
        setState((s) => ({ ...s, isFunding: false, error: msg }));
        onComplete?.();
        return;
      }

      // 3. Get treasury USDC ATA and verify balance
      const treasuryAta = deriveAta(fromKeypair.publicKey, USDC_MINT);
      try {
        const ataInfo = await connection.getTokenAccountBalance(treasuryAta);
        const balance = parseInt(ataInfo.value.amount, 10);
        if (balance < totalUsdcRaw) {
          totalUsdcRaw = balance;
        }
      } catch {
        // If we can't check, proceed with the quote amount
      }

      // 4. Split USDC proportionally across destinations
      const usdcAllocations = destinations.map((d) => {
        const proportion = d.amountSol / totalSol;
        return Math.floor(totalUsdcRaw * proportion);
      });

      // Distribute rounding remainder to the first destination
      const allocated = usdcAllocations.reduce((a, b) => a + b, 0);
      if (allocated < totalUsdcRaw) {
        usdcAllocations[0] += totalUsdcRaw - allocated;
      }

      // 5. Process each destination with concurrency limit
      const processSingle = async (idx: number) => {
        if (abortRef.current) return;
        const dest = destinations[idx];
        const usdcRaw = usdcAllocations[idx];
        const usdcHuman = usdcRaw / 10 ** USDC_DECIMALS;

        const updateExchange = (updates: Partial<StealthExchangeState>) => {
          setState((s) => {
            const exchanges = [...s.exchanges];
            exchanges[idx] = { ...exchanges[idx], ...updates };
            return { ...s, exchanges };
          });
        };

        try {
          // a. Create ChangeNow exchange (USDC -> SOL, dest address)
          updateExchange({
            status: ChangeNowStatus.WAITING,
            statusLabel: 'Creating exchange...',
          });

          const exchange = await client.createExchange(usdcHuman, dest.address);
          updateExchange({
            exchangeId: exchange.id,
            estimatedReceive: exchange.expectedReceive || dest.amountSol * 0.99,
            fee: dest.amountSol - (exchange.expectedReceive || dest.amountSol * 0.99),
            status: ChangeNowStatus.WAITING,
            statusLabel: 'Sending USDC deposit...',
          });

          // b. Get/create deposit ATA (ChangeNow deposit address needs a USDC ATA)
          const depositPubkey = new PublicKey(exchange.payinAddress);
          const depositAta = await getOrCreateAta(connection, fromKeypair, USDC_MINT, depositPubkey);

          // c. Send USDC from treasury ATA to deposit ATA
          const transferIx = createSplTransferIx(
            treasuryAta,
            depositAta,
            fromKeypair.publicKey,
            usdcRaw,
          );

          const tx = new Transaction().add(transferIx);
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          tx.feePayer = fromKeypair.publicKey;
          tx.sign(fromKeypair);

          const depositSig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
          });

          await waitForConfirmation(connection, depositSig);

          updateExchange({
            depositTxHash: depositSig,
            status: ChangeNowStatus.CONFIRMING,
            statusLabel: 'USDC deposit sent, confirming...',
          });

          // d. Poll status every 10s until finished/failed/timeout
          const deadline = Date.now() + TIMEOUT_MS;
          while (Date.now() < deadline && !abortRef.current) {
            await sleep(POLL_INTERVAL);
            const status = await client.getStatus(exchange.id);

            updateExchange({
              status: status.status,
              statusLabel: status.statusLabel || CHANGENOW_STATUS_LABELS[status.status] || 'Unknown',
              estimatedReceive: status.amountReceive || exchange.expectedReceive || dest.amountSol * 0.99,
            });

            // Success
            if (status.status === ChangeNowStatus.FINISHED) {
              completedCount++;
              setState((s) => ({ ...s, completedCount }));
              return;
            }

            // Failure terminal states
            if (
              status.status === ChangeNowStatus.FAILED ||
              status.status === ChangeNowStatus.REFUNDED ||
              status.status === ChangeNowStatus.EXPIRED
            ) {
              failedCount++;
              updateExchange({ error: `Exchange ${CHANGENOW_STATUS_LABELS[status.status]}` });
              setState((s) => ({ ...s, failedCount }));
              return;
            }
          }

          // Timeout
          failedCount++;
          updateExchange({ error: 'Timed out (15 min)' });
          setState((s) => ({ ...s, failedCount }));
        } catch (err) {
          failedCount++;
          const msg = err instanceof Error ? err.message : 'Unknown error';
          updateExchange({ error: msg, statusLabel: 'Failed' });
          setState((s) => ({ ...s, failedCount }));
        }
      };

      // Run with concurrency limit of 5
      const concurrency = Math.min(5, destinations.length);
      let nextIdx = 0;

      const worker = async () => {
        while (nextIdx < destinations.length && !abortRef.current) {
          const idx = nextIdx++;
          await processSingle(idx);
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));

      setState((s) => ({ ...s, isFunding: false }));
      onComplete?.();
    },
    [rpcUrl],
  );

  const cancelAll = useCallback(() => {
    abortRef.current = true;
    setState((s) => ({ ...s, isFunding: false }));
  }, []);

  return { state, getQuote, fundStealth, cancelAll };
}
