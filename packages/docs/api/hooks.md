# Hooks API

Custom React hooks that wrap the core functionality for use in components.

## useSecureWallet

**Location**: `packages/ui/src/hooks/useSecureWallet.ts`

The primary hook for wallet operations. Wraps the `BrowserWalletManager` singleton.

```typescript
const {
  wallets,           // Wallet[] — all wallets in the vault
  isLocked,          // boolean — whether the vault is locked
  unlock,            // (password: string) => Promise<void>
  lock,              // () => void
  generateWallet,    // (name, type, password) => Promise<Wallet>
  generateWallets,   // (count, prefix, type, password) => Promise<Wallet[]>
  removeWallets,     // (ids, password) => Promise<void>
  getKeypairs,       // (ids, password) => Promise<Keypair[]>
  getPassword,       // () => string | null
  importWallet,      // (privateKey, name, type, password) => Promise<Wallet>
  exportBackup,      // () => string (encrypted JSON)
  changePassword,    // (oldPass, newPass) => Promise<void>
} = useSecureWallet()
```

### Key Behaviors
- Automatically syncs state when wallet changes happen in other tabs
- `getPassword()` returns the cached password from the singleton (no re-prompt needed)
- All mutation methods trigger `broadcastWalletStateChange()` internally
- The hook re-renders when the wallet list changes

### Usage Example

```tsx
function MyComponent() {
  const { wallets, isLocked, unlock, getKeypairs, getPassword } = useSecureWallet()

  const handleTrade = async () => {
    if (isLocked) {
      alert('Unlock your vault first')
      return
    }

    const pw = getPassword()
    if (!pw) return

    const [keypair] = await getKeypairs([wallets[0].id], pw)
    // Use keypair for swap...
  }

  return (
    <div>
      <p>{isLocked ? 'Locked' : `${wallets.length} wallets loaded`}</p>
      <button onClick={handleTrade}>Trade</button>
    </div>
  )
}
```

## useNetwork (from NetworkContext)

```typescript
const { network, rpcUrl, setNetwork, setRpcUrl } = useNetwork()
```

Provides the active network and RPC endpoint.

## useActiveTokens (from ActiveTokensContext)

```typescript
const { tokens, addToken, removeToken } = useActiveTokens()
```

Manages the list of tokens being actively monitored.

## useTxHistory (from TxHistoryContext)

```typescript
const { trades, addTrade } = useTxHistory()
```

Access to the trade history and the method to record new trades.

## usePnL (from PnLContext)

```typescript
const { positions, totalPnL, refreshPrices } = usePnL()
```

Derived position data with real-time price updates.
