export interface LockConfig {
  lpTokenMint: string;
  amount: bigint;
  durationDays: number;
  cliffDays?: number;
  owner: string;
  target?: string;
}

export interface LockState {
  id: string;
  lpTokenMint: string;
  amount: bigint;
  lockedAt: number;
  unlockAt: number;
  cliffAt?: number;
  released: bigint;
  owner: string;
  target: string;
  status: 'locked' | 'unlocking' | 'unlocked' | 'cancelled';
  isCancelled: boolean;
}

export interface LockSchedule {
  totalAmount: bigint;
  unlocked: bigint;
  locked: bigint;
  nextUnlockAt?: number;
  nextUnlockAmount?: bigint;
}
