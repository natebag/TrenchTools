/**
 * Activity Generator Types
 */

export interface ActivityConfig {
  walletCount: number;
  txCount: number;
  solRange: [number, number];
  timeRangeDays: number;
  includeSwaps?: boolean;
  includeSplTransfers?: boolean;
  randomizeOrder?: boolean;
}

export interface ActivityPlan {
  wallets: string[];
  transactions: PlannedTx[];
  estimatedCost: number;
  durationMinutes: number;
}

export interface PlannedTx {
  from: string;
  to: string;
  amount: number;
  timestamp: number;
  type: 'sol_transfer' | 'spl_transfer' | 'swap';
}

export interface ActivityResult {
  success: boolean;
  txCount: number;
  signatures: string[];
  cost: number;
  errors: string[];
}
