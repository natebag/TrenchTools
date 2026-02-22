/**
 * Launch Wallet Guard
 *
 * Protects wallets that have launched PumpFun tokens from accidental deletion.
 * If a launch wallet's keypair is destroyed, creator fees become permanently
 * unclaimable on-chain.
 */

const LAUNCH_HISTORY_KEY = 'trench_launch_history';

interface LaunchRecord {
  mintAddress: string;
  name: string;
  symbol: string;
  creatorWallet: string;
  timestamp: number;
}

/** Get all wallet addresses that have ever launched a token. */
export function getLaunchWalletAddresses(): Set<string> {
  try {
    const raw = localStorage.getItem(LAUNCH_HISTORY_KEY);
    if (!raw) return new Set();
    const history: LaunchRecord[] = JSON.parse(raw);
    return new Set(history.map(h => h.creatorWallet));
  } catch {
    return new Set();
  }
}

/** Check if a wallet address has launched a token. */
export function isLaunchWallet(address: string): boolean {
  return getLaunchWalletAddresses().has(address);
}

/** Get all launches associated with a wallet address. */
export function getLaunchesForWallet(address: string): LaunchRecord[] {
  try {
    const raw = localStorage.getItem(LAUNCH_HISTORY_KEY);
    if (!raw) return [];
    const history: LaunchRecord[] = JSON.parse(raw);
    return history.filter(h => h.creatorWallet === address);
  } catch {
    return [];
  }
}

/**
 * Filter out launch wallet IDs from a deletion list.
 * Returns { safeIds, protectedIds, protectedDetails }.
 */
export function filterLaunchWallets(
  walletIds: string[],
  walletLookup: Array<{ id: string; address: string }>,
): {
  safeIds: string[];
  protectedIds: string[];
  protectedDetails: string[];
} {
  const launchAddresses = getLaunchWalletAddresses();
  const safeIds: string[] = [];
  const protectedIds: string[] = [];
  const protectedDetails: string[] = [];

  for (const id of walletIds) {
    const wallet = walletLookup.find(w => w.id === id);
    if (wallet && launchAddresses.has(wallet.address)) {
      protectedIds.push(id);
      const launches = getLaunchesForWallet(wallet.address);
      const tokenNames = launches.map(l => `${l.name} ($${l.symbol})`).join(', ');
      protectedDetails.push(
        `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)} launched: ${tokenNames}`,
      );
    } else {
      safeIds.push(id);
    }
  }

  return { safeIds, protectedIds, protectedDetails };
}
