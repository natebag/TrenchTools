# TrenchSniper Hosted Service Architecture

> Draft v0.1 - 2026-02-15

## Overview

TrenchSniper is **open source** — anyone can self-host. The **hosted service** (website + Telegram bot) offers convenience for a small fee.

## Business Model

- **Self-hosted:** Free, run your own infrastructure
- **Hosted service:** 0.05% fee per swap (configurable)

---

## Wallet Architecture

### Core Principle: Non-Custodial
We **never** store or have access to user private keys. All signing happens client-side (browser) or user-side (Telegram with their seed).

### User Wallet Structure
```
┌─────────────────────────────────────┐
│           USER'S ACCOUNT            │
├─────────────────────────────────────┤
│  🔐 Funding Wallet                  │
│     - Generated on signup           │
│     - User controls keys            │
│     - Deposit SOL here              │
│              │                      │
│              ▼                      │
│  💼 Sub-wallets (1-N)               │
│     - Auto-generated for operations │
│     - Funded from main wallet       │
│     - Used for volume/sniping       │
│     - Sweepable back to main        │
└─────────────────────────────────────┘
```

---

## Website Flow

### Authentication Options
1. **Phantom/Solflare Connect** — User connects existing wallet
2. **Fresh Wallet Generation** — We generate keypair client-side in browser

### Wallet Generation (Client-Side)
```typescript
// All happens in browser - keys never touch server
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';

// Generate mnemonic
const mnemonic = bip39.generateMnemonic(128); // 12 words

// Derive keypair
const seed = bip39.mnemonicToSeedSync(mnemonic);
const keypair = Keypair.fromSeed(seed.slice(0, 32));

// Show user their seed phrase ONCE
// Store encrypted in localStorage (user's password)
```

### Transaction Signing
```typescript
// User's keypair stays in browser
// Server provides unsigned transaction
const tx = await fetch('/api/swap/prepare', { ... });
const signedTx = await keypair.sign(tx);
await fetch('/api/swap/submit', { signedTx });
```

---

## Telegram Bot Flow

### First Time Setup (`/start`)
```
🎯 Welcome to TrenchSniper!

I've generated a fresh wallet for you:

📍 Address: ABC123...XYZ
🔐 Seed Phrase (SAVE THIS!):
word1 word2 word3 ... word12

⚠️ This is shown ONCE. Save it somewhere safe!

Your wallet is ready. Deposit SOL to start sniping.
```

### Wallet Storage Options

**Option A: Encrypted on Server (Simpler UX)**
- Store seed encrypted with user-chosen PIN
- User enters PIN for each transaction
- We temporarily decrypt, sign, forget
- Risk: We technically have access if compromised

**Option B: Stateless / User Holds Keys (Safer)**
- User keeps seed phrase
- For each tx, user provides seed (or we derive from Telegram user ID + password)
- Never stored on our side
- Friction: User must trust us with seed each time

**Option C: Hybrid (Recommended)**
- Generate wallet, show seed once
- Store **public key only** on server
- For signing: User connects via web interface OR
- Uses `/sign` command with their seed (deleted immediately)

### Bot Commands
```
/start - Create wallet, show seed
/balance - Check SOL + token balances
/deposit - Show deposit address + QR
/withdraw <amount> <address> - Withdraw SOL
/snipe <token> <amount> - Snipe a token
/volume - Configure volume boosting
/wallets - Manage sub-wallets
/export - Show seed phrase (requires PIN)
/help - Command list
```

---

## Fee Collection

### Implementation
```typescript
// When preparing swap quote
const quote = await jupiter.getQuote({
  inputMint: WSOL,
  outputMint: targetToken,
  amount: userAmount,
});

// Calculate fee (0.05%)
const feeAmount = Math.floor(userAmount * 0.0005);
const netAmount = userAmount - feeAmount;

// Create transaction with two instructions:
// 1. Transfer fee to treasury
// 2. Execute swap with net amount
```

### Treasury Wallet
- Dedicated wallet for fee collection
- Multi-sig recommended for security
- Auto-sweep to cold storage above threshold

---

## Backend API Structure

### Endpoints
```
POST /api/auth/wallet-connect    - Verify wallet signature
POST /api/auth/telegram          - Link Telegram to wallet

GET  /api/wallet/balance         - Get balances
POST /api/wallet/generate-sub    - Create sub-wallet

POST /api/swap/quote             - Get swap quote (includes fee)
POST /api/swap/prepare           - Prepare unsigned transaction
POST /api/swap/submit            - Submit signed transaction

POST /api/volume/config          - Save volume config
POST /api/volume/start           - Start volume session
POST /api/volume/stop            - Stop volume session

GET  /api/snipe/opportunities    - List snipeable tokens
POST /api/snipe/execute          - Execute snipe
```

### Tech Stack (Suggested)
- **Runtime:** Bun or Node.js
- **Framework:** Hono or Express
- **Database:** SQLite (simple) or Postgres (scale)
- **Cache:** Redis (for rate limiting, sessions)
- **Queue:** BullMQ (for async jobs)
- **Hosting:** Railway, Fly.io, or VPS

---

## Database Schema (Minimal)

```sql
-- Users (linked by wallet address)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT UNIQUE,
  main_wallet_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sub-wallets
CREATE TABLE sub_wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  address TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transaction history
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT, -- 'snipe', 'volume_buy', 'volume_sell', 'withdraw'
  signature TEXT,
  amount_sol REAL,
  fee_collected REAL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Volume sessions
CREATE TABLE volume_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  target_token TEXT,
  config JSONB,
  status TEXT, -- 'running', 'stopped', 'completed'
  started_at TIMESTAMP,
  stopped_at TIMESTAMP
);
```

---

## Security Considerations

### Must Have
- [ ] Rate limiting per user/IP
- [ ] Input validation on all endpoints
- [ ] HTTPS only
- [ ] Telegram webhook signature verification
- [ ] No private key logging (ever)

### Should Have
- [ ] Audit logging for all transactions
- [ ] Anomaly detection (unusual volume)
- [ ] User-configurable tx limits
- [ ] 2FA for withdrawals (Telegram confirmation)

### Nice to Have
- [ ] Multi-sig treasury
- [ ] Cold storage auto-sweep
- [ ] Incident response playbook

---

## Deployment

### Railway (Current)
- Already have `railway.json` configured
- Add environment variables for:
  - `TREASURY_WALLET` - Fee collection address
  - `FEE_PERCENTAGE` - 0.0005 (0.05%)
  - `TELEGRAM_BOT_TOKEN`
  - `DATABASE_URL`
  - `JUPITER_API_KEY`

### Telegram Bot Setup
1. Create bot via @BotFather
2. Set webhook: `https://trenchsniper.io/api/telegram/webhook`
3. Configure commands list
4. Enable inline mode (optional)

---

## Next Steps

1. [ ] Finalize domain & branding
2. [ ] Landing page design
3. [ ] Backend API scaffolding
4. [ ] Telegram bot skeleton
5. [ ] Fee collection implementation
6. [ ] Testing on devnet
7. [ ] Mainnet launch

---

*This is a living document. Update as decisions are made.*
