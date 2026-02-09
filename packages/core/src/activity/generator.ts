/**
 * Wallet Activity Generator
 * Create fake transaction history for stealth launches
 */
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { ActivityConfig, ActivityPlan, ActivityResult, PlannedTx } from './types.js';

/**
 * Generate activity plan (dry run)
 */
export function createActivityPlan(
  wallets: string[],
  config: ActivityConfig
): ActivityPlan {
  const transactions: PlannedTx[] = [];
  const now = Date.now();
  const timeRange = config.timeRangeDays * 24 * 60 * 60 * 1000;

  // Generate transactions
  for (let i = 0; i < config.txCount; i++) {
    const sender = wallets[Math.floor(Math.random() * wallets.length)];
    const receiver = wallets[Math.floor(Math.random() * wallets.length)];
    
    // Don't send to self
    if (sender === receiver) continue;

    const amount =
      config.solRange[0] +
      Math.random() * (config.solRange[1] - config.solRange[0]);

    const timestamp = now - Math.random() * timeRange;

    transactions.push({
      from: sender,
      to: receiver,
      amount,
      timestamp,
      type: 'sol_transfer',
    });
  }

  // Sort by timestamp
  const sorted = transactions.sort((a, b) => a.timestamp - b.timestamp);

  const totalSol = sorted.reduce((sum, tx) => sum + tx.amount, 0);
  const estimatedFees = sorted.length * 0.000005;

  return {
    wallets,
    transactions: config.randomizeOrder ? transactions : sorted,
    estimatedCost: totalSol + estimatedFees,
    durationMinutes: (timeRange / 1000 / 60) * 1.5, // Pad 50%
  };
}

/**
 * Execute activity generation
 */
export async function generateActivity(
  connection: Connection,
  config: ActivityConfig,
  signers: { wallet: string; keypair: any }[]
): Promise<ActivityResult> {
  const wallets = signers.map((s) => s.wallet);
  const signerMap = new Map(signers.map((s) => [s.wallet, s.keypair]));

  const plan = createActivityPlan(wallets, config);
  const signatures: string[] = [];
  const errors: string[] = [];

  // Execute transactions with delays to simulate time spread
  for (const tx of plan.transactions) {
    try {
      const signer = signerMap.get(tx.from);
      if (!signer) {
        errors.push(`No signer for ${tx.from}`);
        continue;
      }

      const signature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: new PublicKey(tx.from),
            toPubkey: new PublicKey(tx.to),
            lamports: BigInt(Math.floor(tx.amount * LAMPORTS_PER_SOL)),
          })
        ),
        [signer]
      );

      signatures.push(signature);

      // Small delay between txs
      await new Promise((r) => setTimeout(r, 100));
    } catch (e: any) {
      errors.push(`Tx failed: ${e.message}`);
    }
  }

  return {
    success: errors.length === 0,
    txCount: signatures.length,
    signatures,
    cost: plan.estimatedCost,
    errors,
  };
}

/**
 * Format activity summary
 */
export function formatActivitySummary(plan: ActivityPlan): string {
  return `📊 Activity Plan Generated\n\n` +
    `Wallets: ${plan.wallets.length}\n` +
    `Transactions: ${plan.transactions.length}\n` +
    `Duration: ${(plan.durationMinutes / 60 / 24).toFixed(1)} days\n` +
    `Estimated Cost: ${plan.estimatedCost.toFixed(6)} SOL\n\n` +
    `Sample TXs:\n` +
    plan.transactions.slice(0, 3).map(t =>
      `• ${t.from.slice(0, 6)}... -> ${t.to.slice(0, 6)}... (${t.amount.toFixed(4)} SOL)`
    ).join('\n') +
    (plan.transactions.length > 3 ? `
... and ${plan.transactions.length - 3} more` : '');
}

/**
 * Quick preset for stealth launch wallets
 */
export function createStealthPlan(wallets: string[]): ActivityPlan {
  return createActivityPlan(wallets, {
    walletCount: wallets.length,
    txCount: wallets.length * 5,
    solRange: [0.001, 0.01],
    timeRangeDays: 30,
    includeSwaps: false,
    randomizeOrder: true,
  });
}
