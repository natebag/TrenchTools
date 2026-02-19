# Wallet System

The wallet system is the foundation of TrenchTools. All trading, volume, and bot operations depend on wallets stored in the browser-encrypted vault.

## Wallet Types

| Type | Purpose | Used By |
|------|---------|---------|
| **Treasury** | Main SOL holder, funds other wallets | Treasury Manager, Bot Groups (funding source) |
| **Sniper** | Token sniping and position holding | Sniper Control, Quick Swap |
| **Burner** | Ephemeral wallets for bots | Bot Groups (auto-generated, auto-deleted) |

## Vault Encryption

Wallets are encrypted at rest using the `useSecureWallet` hook and `BrowserWalletManager`:

1. **Password → Key Derivation** — Your vault password is used to derive an AES-256 encryption key
2. **AES-256-GCM** — The wallet data blob is encrypted via Web Crypto API
3. **localStorage** — Encrypted blob stored in `trenchsniper_secure_wallets`

The vault is locked by default. Unlocking requires the vault password, which decrypts all wallets into memory. Call `getKeypairs()` to get the decrypted `Keypair[]` for trading operations. The password is held in the singleton `BrowserWalletManager` instance while unlocked and cleared on lock.

### Hosted Mode Vault Sync

When using the hosted version (app.trenchtools.io), the encrypted vault blob is synced to the server after save operations. This enables cross-device access — log in on a new device and your vault is available (you still need your vault password to decrypt). The server stores only the encrypted blob and can never read your keys.

## Wallet Operations

### Generate
Creates a new random Solana keypair and adds it to the vault.

### Import
Import an existing wallet by private key (base58 encoded).

### Export / Backup
Export your encrypted vault as a JSON backup file.

### Remove
Permanently deletes a wallet from the vault. Irreversible.

### Bulk Operations
- **Bulk Fund**: Send SOL from treasury to multiple wallets at once
- **Bulk Sweep**: Collect all SOL from sub-wallets back to treasury
- **Sell All Tokens**: Sell all token holdings across all wallets (Jupiter → PumpFun fallback)

## Wallet IDs

Each wallet gets an ID in the format `wallet_{first8CharsOfPublicKey}`. This ID is used internally for state management and cross-component references.

## Cross-Tab Sync

Wallet state changes are broadcast across browser tabs using a custom event system. If you unlock the vault in one tab, all tabs update automatically via `broadcastWalletStateChange()`.

## Bot Wallets

Bot Groups generate burner wallets with a naming pattern like `BotName-W1`, `BotName-W2`, etc. These are:
- Hidden from the main wallet list in Treasury Manager
- Shown in a collapsible "Bot Wallets" section at the bottom
- Automatically deleted when a bot group stops
