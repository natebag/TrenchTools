# Wallet Manager API

The `BrowserWalletManager` is a singleton class that handles all wallet operations with browser-based encryption.

**Location**: `packages/ui/src/lib/browserWallet.ts`

## BrowserWalletManager

### Getting the Instance

```typescript
import { getWalletManager } from '../lib/browserWallet'

const manager = getWalletManager()
```

The manager is a singleton — all components share the same instance.

### Methods

#### unlock(password)
```typescript
async unlock(password: string): Promise<Wallet[]>
```
Decrypts the wallet vault and loads all wallets into memory. Stores the password for later operations.

#### lock()
```typescript
lock(): void
```
Clears all in-memory keypairs and the stored password. The encrypted vault in localStorage remains intact.

#### getPassword()
```typescript
getPassword(): string | null
```
Returns the vault password if currently unlocked, or `null` if locked.

#### generateWallet(name, type, password)
```typescript
async generateWallet(name: string, type: WalletType, password: string): Promise<Wallet>
```
Generates a new random Solana keypair, adds it to the vault, and re-encrypts.

#### generateWallets(count, namePrefix, type, password)
```typescript
async generateWallets(count: number, namePrefix: string, type: WalletType, password: string): Promise<Wallet[]>
```
Generates multiple wallets at once. Names are suffixed with index: `{prefix}1`, `{prefix}2`, etc.

#### removeWallets(walletIds, password)
```typescript
async removeWallets(walletIds: string[], password: string): Promise<void>
```
Removes wallets by ID from the vault and re-encrypts. Throws if no matching wallets found.

#### getKeypairs(walletIds, password)
```typescript
async getKeypairs(walletIds: string[], password: string): Promise<Keypair[]>
```
Returns decrypted `Keypair` objects for the specified wallet IDs.

#### getAllKeypairs()
```typescript
getAllKeypairs(): Map<string, Keypair>
```
Returns all currently loaded keypairs (only available while unlocked).

## Wallet Type

```typescript
interface Wallet {
  id: string           // wallet_{first8CharsOfPublicKey}
  name: string         // User-assigned name
  type: WalletType     // 'treasury' | 'sniper' | 'burner'
  address: string      // Base58 public key
}

type WalletType = 'treasury' | 'sniper' | 'burner'
```

## Cross-Tab Sync

After any mutation (generate, remove, rename), the manager broadcasts a state change event:

```typescript
broadcastWalletStateChange()
// Dispatches a custom event that all useSecureWallet hook instances listen to
```

All tabs/components automatically sync via `syncStateFromManager()`.

## Important Notes

- Wallet IDs are deterministic: `wallet_{publicKey.slice(0, 8)}`
- The vault uses Argon2 for key derivation and AES-GCM for encryption
- The `keypairs` Map in memory is the only place unencrypted keys exist
- Always check `isLocked` before attempting operations that need keypairs
