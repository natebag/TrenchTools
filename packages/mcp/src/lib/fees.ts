/**
 * Post-swap SOL fee collection for hosted mode.
 *
 * In hosted mode, fees are collected as a separate SOL transfer after the swap
 * succeeds — NOT via Jupiter's platformFeeBps (which requires per-token ATAs).
 */

import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';

/**
 * Send a SOL fee transfer to the fee collection wallet.
 * Returns the transaction signature, or null if fee is zero.
 * Errors are intentionally NOT thrown — fee failure should not fail the trade.
 */
export async function collectFee(
  connection: Connection,
  wallet: Keypair,
  swapAmountSol: number,
  feeAccount: string,
  feeBps: number,
): Promise<string | null> {
  const feeLamports = Math.floor(swapAmountSol * LAMPORTS_PER_SOL * feeBps / 10000);
  if (feeLamports <= 0) return null;

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: new PublicKey(feeAccount),
      lamports: feeLamports,
    }),
  );
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  return sig;
}
