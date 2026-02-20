/**
 * useStealthFund — React hook for Houdini stealth funding lifecycle.
 *
 * Handles: quote → create exchange → send deposit tx → poll status → complete
 * Supports batch funding with concurrency limit and progress tracking.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import {
  HoudiniClient,
  HoudiniStatus,
  HOUDINI_STATUS_LABELS,
} from '@/lib/houdini';

// ── Types ──

export interface StealthExchangeState {
  walletAddress: string;
  label: string;
  status: HoudiniStatus;
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

const POLL_INTERVAL = 10_000;
const TIMEOUT_MS = 15 * 60 * 1000;

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
      const client = new HoudiniClient();
      const quote = await client.getQuote(amountSol);
      setState((s) => ({ ...s, isQuoting: false }));
      return quote;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quote failed';
      setState((s) => ({ ...s, isQuoting: false, error: msg }));
      return null;
    }
  }, []);

  const fundStealth = useCallback(
    async (
      fromKeypair: Keypair,
      destinations: StealthDestination[],
      onComplete?: () => void,
    ) => {
      abortRef.current = false;
      const connection = new Connection(rpcUrl, 'confirmed');
      const client = new HoudiniClient();

      // Initialize exchange states
      const initial: StealthExchangeState[] = destinations.map((d) => ({
        walletAddress: d.address,
        label: d.label,
        status: HoudiniStatus.NEW,
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

      const processSingle = async (idx: number) => {
        if (abortRef.current) return;
        const dest = destinations[idx];

        const updateExchange = (updates: Partial<StealthExchangeState>) => {
          setState((s) => {
            const exchanges = [...s.exchanges];
            exchanges[idx] = { ...exchanges[idx], ...updates };
            return { ...s, exchanges };
          });
        };

        try {
          // 1. Get quote
          const quote = await client.getQuote(dest.amountSol);
          updateExchange({
            estimatedReceive: quote.amountOut,
            fee: quote.fee,
            status: HoudiniStatus.WAITING,
            statusLabel: 'Creating exchange...',
          });

          // 2. Create exchange
          const exchange = await client.createExchange(dest.amountSol, dest.address);
          updateExchange({
            exchangeId: exchange.houdiniId,
            status: HoudiniStatus.WAITING,
            statusLabel: 'Sending deposit...',
          });

          // 3. Send deposit tx
          const depositPubkey = new PublicKey(exchange.depositAddress);
          const lamports = Math.floor(dest.amountSol * LAMPORTS_PER_SOL);

          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: fromKeypair.publicKey,
              toPubkey: depositPubkey,
              lamports,
            }),
          );
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          tx.feePayer = fromKeypair.publicKey;
          tx.sign(fromKeypair);
          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });

          updateExchange({
            depositTxHash: sig,
            status: HoudiniStatus.CONFIRMING,
            statusLabel: 'Deposit sent, confirming...',
          });

          // 4. Poll until terminal
          const deadline = Date.now() + TIMEOUT_MS;
          while (Date.now() < deadline && !abortRef.current) {
            await sleep(POLL_INTERVAL);
            const status = await client.getStatus(exchange.houdiniId);

            updateExchange({
              status: status.status,
              statusLabel: status.statusLabel || HOUDINI_STATUS_LABELS[status.status] || 'Unknown',
              estimatedReceive: status.outAmount || quote.amountOut,
            });

            if (status.status === HoudiniStatus.FINISHED) {
              completedCount++;
              setState((s) => ({ ...s, completedCount }));
              return;
            }

            if (
              status.status === HoudiniStatus.EXPIRED ||
              status.status === HoudiniStatus.FAILED ||
              status.status === HoudiniStatus.REFUNDED
            ) {
              failedCount++;
              updateExchange({ error: `Exchange ${HOUDINI_STATUS_LABELS[status.status]}` });
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
