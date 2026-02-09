/**
 * Jito Bundle Builder
 * MEV protection through Jito bundles
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';

// Jito tip accounts (one per region)
export const JITO_TIP_ACCOUNTS = [
  new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
  new PublicKey('HFqU5x63VTqvQss8hp11i4bVmB4Mq7K4vN8kLqR4EXya'),
  new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY'),
  new PublicKey('ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49'),
  new PublicKey('DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'),
  new PublicKey('ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt'),
  new PublicKey('DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL'),
  new PublicKey('3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'),
];

export interface JitoConfig {
  /** Block engine URL */
  blockEngineUrl: string;
  /** Tip amount in lamports */
  tipLamports: number;
  /** Auth keypair for Jito */
  authKeypair?: Keypair;
}

export interface BundleTransaction {
  /** Transaction to include */
  transaction: Transaction | VersionedTransaction;
  /** Signer keypairs */
  signers: Keypair[];
}

export interface BundleResult {
  bundleId: string;
  status: 'pending' | 'landed' | 'failed';
  slot?: number;
  error?: string;
}

/**
 * Jito Bundle Builder
 */
export class JitoBundleBuilder {
  private blockEngineUrl: string;
  private tipLamports: number;
  private _authKeypair?: Keypair;
  private transactions: BundleTransaction[] = [];

  constructor(config: JitoConfig) {
    this.blockEngineUrl = config.blockEngineUrl;
    this.tipLamports = config.tipLamports;
    this._authKeypair = config.authKeypair;
  }

  /**
   * Get a random Jito tip account
   */
  static getRandomTipAccount(): PublicKey {
    const index = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
    return JITO_TIP_ACCOUNTS[index];
  }

  /**
   * Add a transaction to the bundle
   */
  addTransaction(tx: Transaction | VersionedTransaction, signers: Keypair[]): this {
    this.transactions.push({ transaction: tx, signers });
    return this;
  }

  /**
   * Clear all transactions
   */
  clear(): this {
    this.transactions = [];
    return this;
  }

  /**
   * Build tip instruction
   */
  buildTipInstruction(payer: PublicKey): Transaction {
    const tipAccount = JitoBundleBuilder.getRandomTipAccount();
    
    return new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: tipAccount,
        lamports: this.tipLamports,
      })
    );
  }

  /**
   * Build the bundle with tip
   */
  async build(
    connection: Connection,
    tipPayer: Keypair
  ): Promise<(Transaction | VersionedTransaction)[]> {
    if (this.transactions.length === 0) {
      throw new Error('No transactions in bundle');
    }

    const { blockhash, lastValidBlockHeight } = 
      await connection.getLatestBlockhash('confirmed');

    const signedTransactions: (Transaction | VersionedTransaction)[] = [];

    // Sign all transactions
    for (const { transaction, signers } of this.transactions) {
      if (transaction instanceof Transaction) {
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = signers[0].publicKey;
        transaction.sign(...signers);
        signedTransactions.push(transaction);
      } else {
        // VersionedTransaction - already signed
        signedTransactions.push(transaction);
      }
    }

    // Add tip transaction at the end
    const tipTx = this.buildTipInstruction(tipPayer.publicKey);
    tipTx.recentBlockhash = blockhash;
    tipTx.lastValidBlockHeight = lastValidBlockHeight;
    tipTx.feePayer = tipPayer.publicKey;
    tipTx.sign(tipPayer);
    signedTransactions.push(tipTx);

    return signedTransactions;
  }

  /**
   * Send bundle to Jito
   */
  async sendBundle(
    connection: Connection,
    tipPayer: Keypair
  ): Promise<BundleResult> {
    const transactions = await this.build(connection, tipPayer);
    
    // Serialize transactions to base58
    const serialized = transactions.map(tx => {
      if (tx instanceof Transaction) {
        return bs58.encode(tx.serialize());
      } else {
        return bs58.encode(tx.serialize());
      }
    });

    try {
      const response = await fetch(`${this.blockEngineUrl}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serialized],
        }),
      });

      const result = await response.json() as any;

      if (result.error) {
        return {
          bundleId: '',
          status: 'failed',
          error: result.error.message || JSON.stringify(result.error),
        };
      }

      return {
        bundleId: result.result,
        status: 'pending',
      };
    } catch (error) {
      return {
        bundleId: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check bundle status
   */
  async getBundleStatus(bundleId: string): Promise<BundleResult> {
    try {
      const response = await fetch(`${this.blockEngineUrl}/api/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [[bundleId]],
        }),
      });

      const result = await response.json() as any;

      if (result.error) {
        return {
          bundleId,
          status: 'failed',
          error: result.error.message,
        };
      }

      const status = result.result?.value?.[0];
      if (!status) {
        return { bundleId, status: 'pending' };
      }

      if (status.confirmation_status === 'confirmed' || status.confirmation_status === 'finalized') {
        return {
          bundleId,
          status: 'landed',
          slot: status.slot,
        };
      }

      if (status.err) {
        return {
          bundleId,
          status: 'failed',
          error: JSON.stringify(status.err),
        };
      }

      return { bundleId, status: 'pending' };
    } catch (error) {
      return {
        bundleId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send bundle and wait for confirmation
   */
  async sendAndConfirm(
    connection: Connection,
    tipPayer: Keypair,
    timeoutMs: number = 30000
  ): Promise<BundleResult> {
    const sendResult = await this.sendBundle(connection, tipPayer);
    
    if (sendResult.status === 'failed') {
      return sendResult;
    }

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getBundleStatus(sendResult.bundleId);
      
      if (status.status !== 'pending') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      bundleId: sendResult.bundleId,
      status: 'failed',
      error: 'Bundle timed out',
    };
  }
}

/**
 * Create a simple Jito bundle for a single transaction
 */
export async function sendWithJito(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  config: JitoConfig
): Promise<BundleResult> {
  const builder = new JitoBundleBuilder(config);
  builder.addTransaction(transaction, signers);
  return builder.sendAndConfirm(connection, signers[0]);
}
