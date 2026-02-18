# Security Model

TrenchSniper OS is designed with a "trust nothing, host everything locally" security model.

## Encryption

### Wallet Vault
Private keys are encrypted at rest using a two-layer scheme:

1. **Key Derivation**: User password → Argon2 → 256-bit encryption key
2. **Encryption**: AES-256-GCM via Web Crypto API

The encrypted blob is stored in localStorage. Decryption only happens when the user enters their vault password.

### In-Memory Security
While the vault is unlocked:
- Keypairs are held in a `Map<string, Keypair>` in the `BrowserWalletManager` singleton
- The vault password is stored as a private field in the singleton
- On lock: all keypairs are cleared from memory and the password reference is set to null

### What's NOT Encrypted
- Wallet public keys (addresses) — stored in plaintext for display
- Trade history — stored in plaintext (no private keys involved)
- Settings — stored in plaintext
- Bot configurations — stored in plaintext

## Network Security

### No Backend Server
TrenchSniper OS has no backend. The UI is a static SPA that communicates directly with:
- Your configured Solana RPC endpoint
- Jupiter Quote/Swap API (HTTPS)
- PumpPortal API (HTTPS)
- DexScreener API (HTTPS)

No TrenchSniper server ever sees your keys, trades, or data.

### RPC Trust
You must trust your RPC provider with your transaction data. They can see:
- Your wallet addresses
- Transactions you submit
- Balance queries you make

For maximum privacy, run your own Solana validator/RPC node.

## Transaction Security

### Slippage Protection
All swaps include configurable slippage tolerance. The transaction will revert if the price moves beyond your tolerance during execution.

### Priority Fees
Configurable priority fees help your transactions land faster, reducing the window for front-running.

### Jito Tips
Optional Jito validator tips for MEV protection on critical transactions.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Stolen laptop** | Vault is encrypted; attacker needs password |
| **Malicious browser extension** | Extensions can read localStorage; use a dedicated browser profile |
| **RPC man-in-the-middle** | Use HTTPS RPC endpoints only |
| **XSS attack** | React's built-in XSS protection; no `dangerouslySetInnerHTML` |
| **Supply chain attack** | Open source; audit dependencies; pin versions |
| **Memory dump** | Keypairs are in JS heap while unlocked; lock vault when not trading |

## Best Practices

1. **Use a strong vault password** — 12+ characters, not reused
2. **Lock the vault** when you're done trading
3. **Export backups** regularly and store them securely
4. **Use a dedicated browser profile** for TrenchSniper
5. **Start on devnet** to test all features before using mainnet
6. **Audit the code** — it's open source for a reason
7. **Use a dedicated RPC** — public RPCs may log your activity
