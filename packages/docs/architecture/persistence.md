# Data Persistence

All TrenchSniper OS data is stored in browser `localStorage`. Nothing is sent to any server.

## Storage Keys

| Key | Contents | Size Limit |
|-----|----------|-----------|
| `trenchsniper_secure_wallets` | Encrypted wallet vault (Argon2 + AES-GCM) | Unlimited |
| `trench_tx_history` | Trade records array | 500 records |
| `trench_pnl_data` | P&L position data | Auto-calculated |
| `trench_bot_configs` | Bot group configurations | Up to 6 configs |
| `trench_settings_v1` | User settings (RPC, API keys, theme) | Small |
| `trench_config_v1` | Sniper/trading configuration | Small |
| `trench_activity_v1` | Activity logs | Varies |
| `trench_active_wallet` | Currently selected wallet | 1 entry |
| `trench_all_wallets` | Wallet list summary (public data only) | All wallets |

## Encrypted Data

The wallet vault (`trenchsniper_secure_wallets`) contains encrypted private keys:

```
Password → Argon2 → Derived Key → AES-GCM encrypt(wallet data)
```

- The encryption key is derived from the user's vault password using Argon2
- The wallet data blob is encrypted with AES-GCM via Web Crypto API
- On unlock, the password decrypts the blob and keypairs are held in memory
- On lock, in-memory keypairs are cleared and the password reference is nulled

## In-Memory Only Data

Some data is intentionally not persisted:

| Data | Why Not Persisted |
|------|------------------|
| Bot runtime state | Bots should not auto-resume on page load |
| Decrypted keypairs | Security — only in memory while vault is unlocked |
| Vault password | Security — held in singleton only while unlocked |
| Trade loop timers | setTimeout IDs are not serializable |
| WebSocket connections | Must be re-established on page load |

## Backup & Recovery

### Exporting Wallets
Use the Export feature in Treasury Manager to download an encrypted backup of your wallet vault. This backup can be imported on another device or browser.

### Data Loss Risks
- **Clearing browser data** deletes everything including the encrypted vault
- **Incognito/private mode** — localStorage is cleared when the window closes
- **Different browsers** — each browser has its own separate localStorage

### Recommended Backup Strategy
1. Export wallet backup after creating new wallets
2. Store the backup file securely (encrypted drive, password manager)
3. Test restore on a different browser periodically
