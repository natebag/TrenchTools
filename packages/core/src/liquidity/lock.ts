/**
 * LP Token Lock - Liquidity locking via Streamflow
 * 
 * Note: This is a pattern/structure. Actual Streamflow integration
 * requires their SDK/program addresses.
 */

import type { LockConfig, LockState, LockSchedule, EmergencyUnlock } from './types.js';

/**
 * Create a new lock
 * In production, this would call Streamflow contract
 */
export async function lockLPTokens(
  config: LockConfig
): Promise<{ success: boolean; lock?: LockState; error?: string }> {
  try {
    const now = Date.now();
    const lockId = `lock-${now}-${config.lpTokenMint.slice(0, 6)}`;

    const lock: LockState = {
      id: lockId,
      lpTokenMint: config.lpTokenMint,
      amount: config.amount,
      lockedAt: now,
      unlockAt: now + config.durationDays * 24 * 60 * 60 * 1000,
      cliffAt: config.cliffDays
        ? now + config.cliffDays * 24 * 60 * 60 * 1000
        : undefined,
      released: BigInt(0),
      owner: config.owner,
      target: config.target || config.owner,
      status: 'locked',
      isCancelled: false,
    };

    // In production: Call Streamflow contract here
    // const signature = await streamflow.createLock(...);

    return { success: true, lock };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Lock creation failed',
    };
  }
}

/**
 * Calculate unlock schedule
 */
export function getUnlockSchedule(lock: LockState): LockSchedule {
  const now = Date.now();

  if (now < (lock.cliffAt || lock.lockedAt)) {
    return {
      totalAmount: lock.amount,
      unlocked: BigInt(0),
      locked: lock.amount,
      nextUnlockAt: lock.cliffAt,
    };
  }

  if (now >= lock.unlockAt) {
    return {
      totalAmount: lock.amount,
      unlocked: lock.amount,
      locked: BigInt(0),
    };
  }

  // Linear vesting
  const totalDuration = lock.unlockAt - (lock.cliffAt || lock.lockedAt);
  const elapsed = now - (lock.cliffAt || lock.lockedAt);
  const percentUnlocked = Math.min(elapsed / totalDuration, 1);
  const unlocked = BigInt(Math.floor(Number(lock.amount) * percentUnlocked));

  return {
    totalAmount: lock.amount,
    unlocked: unlocked - lock.released,
    locked: lock.amount - unlocked,
    nextUnlockAt: lock.unlockAt,
    nextUnlockAmount: (lock.amount - unlocked) / BigInt(10) || BigInt(1),
  };
}

/**
 * Get lock status
 */
export function getLockStatus(lock: LockState): {
  status: LockState['status'];
  progress: number; // 0-100
  timeRemaining: string;
} {
  const schedule = getUnlockSchedule(lock);
  const progress =
    Number((schedule.unlocked * BigInt(100)) / lock.amount) +
    Number((lock.released * BigInt(100)) / lock.amount);

  const remaining = lock.unlockAt - Date.now();
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  let status: LockState['status'] = 'locked';
  if (lock.isCancelled) status = 'cancelled';
  else if (Date.now() >= lock.unlockAt) status = 'unlocked';
  else if (schedule.unlocked > BigInt(0)) status = 'unlocking';

  return {
    status,
    progress,
    timeRemaining: days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h` : 'Unlocked',
  };
}

/**
 * Check if emergency unlock is possible
 */
export function checkEmergencyUnlock(lock: LockState): EmergencyUnlock {
  // Configurable per deployment
  return {
    allowed: !lock.isCancelled,
    penaltyPercent: 10, // 10% penalty
    penaltyRecipient: 'treasury', // Where penalty goes
  };
}

/**
 * Format lock for display
 */
export function formatLock(lock: LockState): string {
  const status = getLockStatus(lock);
  const schedule = getUnlockSchedule(lock);

  let output = `🔒 LP Lock Details\n\n`;
  output += `Token: ${lock.lpTokenMint.slice(0, 8)}...\n`;
  output += `Amount: ${lock.amount.toString()}\n`;
  output += `Status: ${status.status.toUpperCase()}\n`;
  output += `Progress: ${status.progress.toFixed(1)}%\n`;
  output += `Remaining: ${status.timeRemaining}\n\n`;

  output += `Unlocked: ${schedule.unlocked.toString()}\n`;
  output += `Locked: ${schedule.locked.toString()}\n`;
  output += `Released: ${lock.released.toString()}\n\n`;

  output += `Owner: ${lock.owner.slice(0, 6)}...${lock.owner.slice(-4)}\n`;
  output += `Target: ${lock.target.slice(0, 6)}...${lock.target.slice(-4)}\n`;
  output += `Locked: ${new Date(lock.lockedAt).toISOString().split('T')[0]}`;
  output += `\nUnlock: ${new Date(lock.unlockAt).toISOString().split('T')[0]}`;

  if (lock.cliffAt) {
    output += `\nCliff: ${new Date(lock.cliffAt).toISOString().split('T')[0]}`;
  }

  return output;
}

// Mock locks storage (replace with on-chain in production)
const activeLocks = new Map<string, LockState>();

export function saveLock(lock: LockState): void {
  activeLocks.set(lock.id, lock);
}

export function getLock(id: string): LockState | undefined {
  return activeLocks.get(id);
}

export function listLocks(owner?: string): LockState[] {
  const locks = Array.from(activeLocks.values());
  return owner ? locks.filter((l) => l.owner === owner) : locks;
}

export function cancelLock(id: string): boolean {
  const lock = activeLocks.get(id);
  if (!lock) return false;
  lock.isCancelled = true;
  lock.status = 'cancelled';
  return true;
}
