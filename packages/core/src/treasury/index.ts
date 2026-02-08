/**
 * Treasury Module - Main wallet funding & distribution
 */
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export interface TreasuryConfig {
  mainWallet: string; // The "treasury" that receives funds
  sniperWallets: string[]; // Wallets to fund
  targetBalance: number; // SOL per sniper wallet
  minTreasuryBalance: number; // Keep this much in treasury
}

export interface TreasuryStatus {
  mainWallet: string;
  mainBalance: number;
  sniperWallets: {
    address: string;
    balance: number;
    target: number;
    needsFunding: boolean;
  }[];
  totalNeeded: number;
  canFundAll: boolean;
}

export interface DistributionResult {
  funded: string[];
  failed: string[];
  totalDistributed: number;
  totalFees: number;
}

export interface FundingRequest {
  from: 'main' | 'external';
  amount: number;
  txSignature?: string;
  timestamp: number;
}

// Track funding history
const fundingHistory: FundingRequest[] = [];

/**
 * Get treasury status
 */
export async function getTreasuryStatus(
  connection: Connection,
  config: TreasuryConfig
): Promise<TreasuryStatus> {
  // Get main wallet balance
  const mainBalance = await connection.getBalance(
    new PublicKey(config.mainWallet)
  ) / LAMPORTS_PER_SOL;

  // Get sniper wallet balances
  const sniperStatuses = await Promise.all(
    config.sniperWallets.map(async (addr) => {
      const balance = await connection.getBalance(new PublicKey(addr)) / LAMPORTS_PER_SOL;
      return {
        address: addr,
        balance,
        target: config.targetBalance,
        needsFunding: balance < config.targetBalance * 0.8, // Below 80% of target
      };
    })
  );

  const totalNeeded = sniperStatuses
    .filter(s => s.needsFunding)
    .reduce((sum, s) => sum + (config.targetBalance - s.balance), 0);

  return {
    mainWallet: config.mainWallet,
    mainBalance,
    sniperWallets: sniperStatuses,
    totalNeeded,
    canFundAll: mainBalance >= totalNeeded + config.minTreasuryBalance,
  };
}

/**
 * Distribute from main wallet to sniper wallets
 */
export async function distributeFunds(
  connection: Connection,
  config: TreasuryConfig,
  signer: any // Main wallet keypair
): Promise<DistributionResult> {
  const status = await getTreasuryStatus(connection, config);
  const funded: string[] = [];
  const failed: string[] = [];
  let totalDistributed = 0;
  let totalFees = 0;

  for (const sniper of status.sniperWallets) {
    if (!sniper.needsFunding) {
      funded.push(sniper.address); // Already has funds
      continue;
    }

    const amountToSend = config.targetBalance - sniper.balance;
    const amountLamports = BigInt(Math.floor(amountToSend * LAMPORTS_PER_SOL));

    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(config.mainWallet),
          toPubkey: new PublicKey(sniper.address),
          lamports: amountLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
        commitment: 'confirmed',
      });

      funded.push(sniper.address);
      totalDistributed += amountToSend;

      // Record ~0.000005 SOL fee
      totalFees += 0.000005;

      fundingHistory.push({
        from: 'main',
        amount: amountToSend,
        txSignature: signature,
        timestamp: Date.now(),
      });
    } catch (error) {
      failed.push(sniper.address);
    }
  }

  return {
    funded,
    failed,
    totalDistributed,
    totalFees,
  };
}

/**
 * Auto-fund sniper wallets (run periodically)
 */
export async function autoFund(
  connection: Connection,
  config: TreasuryConfig,
  signer: any,
  onProgress?: (msg: string) => void
): Promise<DistributionResult> {
  const status = await getTreasuryStatus(connection, config);

  if (!status.canFundAll) {
    const needed = status.totalNeeded + config.minTreasuryBalance - status.mainBalance;
    if (onProgress) {
      onProgress(`⚠️ Insufficient treasury funds. Need ${needed.toFixed(4)} more SOL`);
    }
    return {
      funded: [],
      failed: config.sniperWallets,
      totalDistributed: 0,
      totalFees: 0,
    };
  }

  if (onProgress) {
    onProgress(`💰 Funding ${status.sniperWallets.filter(s => s.needsFunding).length} wallets...`);
  }

  return distributeFunds(connection, config, signer);
}

/**
 * Record external funding (someone sent SOL to treasury)
 */
export function recordExternalFunding(amount: number, txSignature?: string): void {
  fundingHistory.push({
    from: 'external',
    amount,
    txSignature,
    timestamp: Date.now(),
  });
}

/**
 * Get funding history
 */
export function getFundingHistory(limit = 50): FundingRequest[] {
  return fundingHistory.slice(-limit).reverse();
}

/**
 * Get treasury QR code data (for easy mobile funding)
 */
export function getTreasuryQR(walletAddress: string, amount?: number): string {
  // Solana Pay URI format
  if (amount) {
    return `solana:${walletAddress}?amount=${amount}`;
  }
  return `solana:${walletAddress}`;
}

/**
 * Format treasury status for display
 */
export function formatTreasuryStatus(status: TreasuryStatus): string {
  let output = `🏦 Treasury Status\n\n`;
  output += `Main Wallet: ${status.mainWallet.slice(0, 6)}...${status.mainWallet.slice(-4)}\n`;
  output += `Balance: ${status.mainBalance.toFixed(4)} SOL\n\n`;

  const funded = status.sniperWallets.filter(s => !s.needsFunding).length;
  const needing = status.sniperWallets.filter(s => s.needsFunding).length;

  output += `Sniper Wallets: ${status.sniperWallets.length}\n`;
  output += `✅ Funded: ${funded}\n`;
  output += `⏳ Needs Funding: ${needing}\n`;
  output += `📊 Total Needed: ${status.totalNeeded.toFixed(4)} SOL\n\n`;

  if (!status.canFundAll) {
    const needed = status.totalNeeded + 0.1 - status.mainBalance; // 0.1 buffer
    output += `⚠️ Send ${needed.toFixed(4)} SOL to main wallet\n`;
  } else {
    output += `✅ Ready to fund all wallets\n`;
  }

  return output;
}

/**
 * Format distribution result
 */
export function formatDistributionResult(result: DistributionResult): string {
  const successRate = (result.funded.length / (result.funded.length + result.failed.length) * 100).toFixed(0);

  let output = `💰 Distribution Complete\n\n`;
  output += `✅ Funded: ${result.funded.length}\n`;
  output += `❌ Failed: ${result.failed.length}\n`;
  output += `📊 Success Rate: ${successRate}%\n`;
  output += `💵 Total Sent: ${result.totalDistributed.toFixed(4)} SOL\n`;
  output += `💸 Fees: ${result.totalFees.toFixed(6)} SOL\n`;

  if (result.failed.length > 0) {
    output += `\nFailed Wallets:\n`;
    result.failed.forEach(w => {
      output += `• ${w.slice(0, 6)}...${w.slice(-4)}\n`;
    });
  }

  return output;
}
