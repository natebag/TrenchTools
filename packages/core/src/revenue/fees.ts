/**
 * Creator Fee Claiming
 * Claim bonding curve fees after migration
 */
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

export interface FeeClaimConfig {
  creatorWallet: string;
  tokenMint: string;
  migrated: boolean;
  migrationSlot: number;
}

export interface ClaimableFees {
  available: boolean;
  amount: bigint;
  claimed: boolean;
  claimSlot: number;
}

export interface FeeClaimResult {
  success: boolean;
  txSignature?: string;
  amount: bigint;
  feePaid: number;
  error?: string;
}

/**
 * Calculate claimable creator fees
 * Based on bonding curve activity before migration
 */
export async function calculateClaimableFees(
  connection: Connection,
  tokenMint: PublicKey,
  creatorWallet: PublicKey
): Promise<ClaimableFees> {
  // Get token accounts
  const mintInfo = await connection.getParsedAccountInfo(tokenMint);
  
  if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
    return {
      available: false,
      amount: BigInt(0),
      claimed: false,
      claimSlot: 0,
    };
  }

  // Get creator's associated token account
  const creatorATA = await getAssociatedTokenAddress(tokenMint, creatorWallet);
  
  try {
    const tokenAccount = await connection.getTokenAccountBalance(creatorATA);
    
    // Check if already claimed (simplified)
    const claimed = false; // Would check on-chain claim record
    
    return {
      available: !claimed && BigInt(tokenAccount.value.amount) > BigInt(0),
      amount: BigInt(tokenAccount.value.amount),
      claimed,
      claimSlot: 0,
    };
  } catch {
    // No token account exists yet
    return {
      available: true,
      amount: BigInt(0),
      claimed: false,
      claimSlot: 0,
    };
  }
}

/**
 * Claim creator fees
 */
export async function claimCreatorFees(
  connection: Connection,
  config: FeeClaimConfig,
  _signTransaction: (tx: Transaction) => Promise<string> // Returns signed tx base64 or signature
): Promise<FeeClaimResult> {
  try {
    if (!config.migrated) {
      return {
        success: false,
        amount: BigInt(0),
        feePaid: 0,
        error: 'Token has not migrated to Raydium yet',
      };
    }

    const creator = new PublicKey(config.creatorWallet);
    const mint = new PublicKey(config.tokenMint);

    // Calculate claimable
    const claimable = await calculateClaimableFees(connection, mint, creator);
    
    if (!claimable.available) {
      return {
        success: false,
        amount: BigInt(0),
        feePaid: 0,
        error: claimable.claimed ? 'Already claimed' : 'No fees available',
      };
    }

    // Get creator's ATA
    const creatorATA = await getAssociatedTokenAddress(mint, creator);
    
    // Check if ATA exists
    const ataInfo = await connection.getAccountInfo(creatorATA);
    const tx = new Transaction();

    // Create ATA if needed
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          creator,
          creatorATA,
          creator,
          mint
        )
      );
    }

    // This would call your specific fee claiming contract
    // For now, structure the return
    return {
      success: false,
      amount: claimable.amount,
      feePaid: 0,
      error: 'Fee claiming requires bonding curve contract interaction - implement with your specific contract',
    };

  } catch (error: any) {
    return {
      success: false,
      amount: BigInt(0),
      feePaid: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Track fee claims
 */
export class FeeTracker {
  private claims: Map<string, FeeClaimResult> = new Map();

  recordClaim(tokenMint: string, claim: FeeClaimResult) {
    this.claims.set(tokenMint, claim);
  }

  getClaim(tokenMint: string): FeeClaimResult | undefined {
    return this.claims.get(tokenMint);
  }

  listClaims(): { token: string; claim: FeeClaimResult }[] {
    return Array.from(this.claims.entries()).map(([token, claim]) => ({
      token,
      claim,
    }));
  }

  getTotalClaimed(): bigint {
    return Array.from(this.claims.values())
      .filter((c) => c.success)
      .reduce((sum, c) => sum + c.amount, BigInt(0));
  }
}

// Global tracker
export const feeTracker = new FeeTracker();
