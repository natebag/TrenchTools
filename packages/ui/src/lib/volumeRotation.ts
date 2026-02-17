export const ROTATION_WALLET_PREFIX = '[VOLROT]';

export function buildRotationWalletName(sourceAddress: string, generation: number): string {
  const sourceTag = sourceAddress.slice(0, 8);
  const safeGeneration = Number.isFinite(generation) && generation > 0 ? Math.floor(generation) : 1;
  return `${ROTATION_WALLET_PREFIX} ${sourceTag} #${safeGeneration}`;
}

export function isRotationManagedWallet(walletName?: string): boolean {
  if (!walletName) return false;
  return walletName.startsWith(ROTATION_WALLET_PREFIX);
}
