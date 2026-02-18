# Frequently Asked Questions

Common questions about TrenchTools, organized by topic.

---

## General Questions

### What is TrenchTools?

TrenchTools is an open-source alternative to paid Solana trading tools like Proxima. It provides:
- Token launching and sniping capabilities
- Market making bots with volume patterns
- Manipulation detection analysis
- Secure wallet management

**Key difference:** It's completely free and open-source.

### Is TrenchTools free?

Yes! TrenchTools is MIT licensed and free for everyone. No subscription fees, no hidden costs.

You will still need to pay for:
- RPC endpoint access (or use free endpoints with rate limits)
- Solana transaction fees (gas)
- Your trading capital

### What networks are supported?

- **Solana Mainnet** - Production trading
- **Solana Devnet** - Testing (free SOL from faucets)

### Do I need programming experience?

**For basic usage:** No. The Web UI provides a visual interface for all features.

**For advanced usage:** TypeScript/JavaScript knowledge helps for:
- CLI scripting
- Custom integrations
- Extending functionality

---

## Installation & Setup

### I get "pnpm: command not found"

Install pnpm globally:

```bash
npm install -g pnpm
# OR
corepack enable && corepack prepare pnpm@latest --activate
```

### Build fails with TypeScript errors

1. Ensure you have the correct Node.js version:
   ```bash
   node --version  # Should be ≥ 20.0.0
   ```

2. Clean and rebuild:
   ```bash
   pnpm clean
   pnpm install
   pnpm build
   ```

3. If issues persist, delete node_modules:
   ```bash
   rm -rf node_modules
   rm -rf packages/*/node_modules
   pnpm install
   pnpm build
   ```

### The UI won't start

1. Ensure you've built all packages first:
   ```bash
   pnpm build
   ```

2. Start the UI:
   ```bash
   cd packages/ui
   pnpm dev
   ```

3. Check if port 5173 is available:
   ```bash
   lsof -i :5173  # Should show nothing
   ```

### "RPC endpoint not responding"

- Check your `trench.yaml` configuration
- Test the endpoint directly:
  ```bash
  curl -X POST YOUR_RPC_URL \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
  ```
- Try a different RPC provider

---

## Wallet Management

### How are my wallets stored?

Wallets are encrypted using:
- **AES-256-GCM** encryption algorithm
- **Argon2id** key derivation (memory-hard, GPU-resistant)
- Unique salt and IV per vault

Private keys are never stored in plaintext.

### I forgot my vault password

Unfortunately, there is no password recovery. The encryption is designed to be unbreakable without the password.

**Prevention:**
- Store passwords in a secure password manager
- Keep encrypted backups of your vault files

### Can I import existing wallets?

Yes, you can import:

```typescript
// From JSON keypair file
pnpm cli wallet --import /path/to/keypair.json

// From mnemonic/seed phrase
pnpm cli wallet --import-seed "your twelve word mnemonic phrase here"
```

### How do I export wallets?

```typescript
// Export to encrypted file
pnpm cli wallet --export backup.vault --password "your-password"

// Export to JSON (⚠️ unencrypted!)
pnpm cli wallet --export-json /path/to/keypair.json
```

---

## Trading & Bots

### Why are my swaps failing?

Common causes and solutions:

| Cause | Solution |
|-------|----------|
| Insufficient SOL | Fund the bot wallet |
| High slippage | Increase `slippageBps` |
| Network congestion | Increase `priorityFee` |
| RPC issues | Switch endpoints |
| Pool liquidity | Reduce swap size |

### What's the difference between buy, sell, and both directions?

| Direction | Behavior | Use Case |
|-----------|----------|----------|
| `buy` | Only purchases tokens | Accumulating |
| `sell` | Only sells tokens | Distributing |
| `both` | Alternates buy/sell | Volume generation |

For volume boosting, use `both` to avoid accumulating positions.

### How much SOL do I need per bot?

Rough estimates:

| Intensity | Per Bot | Per 10 Bots |
|-----------|---------|-------------|
| Low | 0.5 SOL | 5 SOL |
| Medium | 2 SOL | 20 SOL |
| High | 5 SOL | 50 SOL |
| Aggressive | 10 SOL | 100 SOL |

This covers:
- Trading capital
- Transaction fees
- Slippage buffer

### Bots stopped after reaching volume target

This is expected behavior if you set `maxTotalVolumeSol` or `stopAfterSwaps`. To continue:

```typescript
// Reset limits and restart
await orchestrator.updateBotConfig(botId, {
  maxTotalVolumeSol: 200,  // Increase limit
});
await orchestrator.startBot(botId);
```

---

## Detection Module

### What data does detection analyze?

- **On-chain transactions** via Allium
- **Wallet funding patterns**
- **Trade timing and sizes**
- **Wallet relationships**

No private data is collected or transmitted.

### Why is my token showing a high manipulation score?

Common reasons:

1. **Early stage** - New tokens naturally have irregular patterns
2. **Few traders** - Low trader count amplifies patterns
3. **Aggressive volume settings** - Your bots are too predictable

Solutions:
- Use organic pattern with more randomization
- Add more wallets with diverse funding
- Reduce trading frequency
- Wait for more organic activity

### Can I reduce my manipulation score?

Yes:

1. **Switch to organic pattern**
2. **Increase interval variance**
3. **Use more wallets from different sources**
4. **Pause bots periodically**
5. **Vary trade sizes more**

Score updates with new trading activity - old patterns fade over time.

### Does detection work for any token?

Detection works for tokens traded on:
- PumpFun
- Raydium
- Meteora

The token must have sufficient trading history (10+ transactions recommended).

---

## Security

### Is TrenchTools safe to use?

**Code security:**
- Open-source, auditable code
- No external data collection
- Local-first architecture

**Your responsibilities:**
- Secure your vault password
- Protect your RPC API keys
- Never share keypair files
- Use trusted RPC endpoints

### How do I secure my setup?

**Essential:**
- [ ] Use strong vault password (12+ characters)
- [ ] Never commit `trench.yaml` to git
- [ ] Keep keypairs in encrypted vaults only
- [ ] Use premium RPC (public endpoints leak your IP)

**Advanced:**
- [ ] Run on dedicated machine/VM
- [ ] Use firewall to restrict outbound connections
- [ ] Rotate wallets periodically
- [ ] Monitor wallet balances for unauthorized activity

### Can my bot wallets be traced?

Yes. On-chain activity is public. Mitigation:
- Use fresh wallets for each campaign
- Fund from different sources
- Don't link to personal wallets
- Use mixers/privacy tools (external to this project)

---

## Troubleshooting

### Common Error Messages

**"Insufficient funds for rent"**
- Wallet needs minimum ~0.003 SOL for rent exemption
- Solution: Fund wallet with at least 0.01 SOL

**"Transaction simulation failed"**
- Usually slippage or liquidity issue
- Solution: Increase slippage or reduce swap size

**"Blockhash not found"**
- Transaction took too long
- Solution: Increase priority fees, try again

**"Rate limit exceeded"**
- RPC endpoint throttling
- Solution: Use premium RPC or add endpoints to pool

### Getting More Help

1. **Check logs:** Most errors are logged with context
2. **Search issues:** GitHub issues may have your answer
3. **Open issue:** Include:
   - Error message
   - Steps to reproduce
   - Relevant config (redact secrets!)
   - Node.js/pnpm versions

---

## Best Practices Summary

### For New Users

1. Start on devnet
2. Use conservative settings
3. Monitor closely for first 24 hours
4. Scale gradually

### For Volume Boosting

1. Use organic pattern
2. 5-10 wallets minimum
3. Keep daily volume realistic
4. Monitor detection score

### For Long-Term Success

1. Build real community alongside volume
2. Rotate strategies periodically
3. Keep software updated
4. Stay informed about network changes

---

## Related Documentation

- [Getting Started](./GETTING_STARTED.md)
- [Bot Configuration](./BOT_CONFIGURATION.md)
- [Detection Guide](./DETECTION_GUIDE.md)
- [Volume Patterns](./VOLUME_PATTERNS.md)

---

*Still have questions? Open an issue on GitHub!*
