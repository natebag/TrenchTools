# Bot Groups

Bot Groups are self-contained market-making units that handle the full wallet lifecycle automatically: generate wallets, fund them, trade, and clean up on stop.

## Overview

Each bot group is an independent trading unit with:
- Its own set of ephemeral burner wallets
- A target token to trade
- Configurable volume patterns and intensity
- Full lifecycle automation (create → fund → trade → sell → sweep → delete)

You can run up to **6 bot groups simultaneously**.

## Creating a Bot Group

1. Navigate to **Market Making** → **Bot Groups** tab
2. Click **Add Group**
3. Fill in the configuration:
   - **Name**: A label for this group (e.g., "PumpBot Alpha")
   - **Target CA**: The token contract address to trade
   - **Wallet Count**: How many wallets to generate (1-10)
   - **SOL Per Wallet**: How much SOL to fund each wallet
   - **Pattern**: organic, steady, burst, or wave
   - **Intensity**: low, medium, high, or aggressive
4. Click **Create**

### Inline Editing

While a bot is stopped, click any config value to edit it inline:
- **Wallet Count**, **SOL Per Wallet**, **Pattern**, **Intensity**
- **Min/Max swap amount** and **Min/Max interval**

Changes are saved immediately — no need to delete and recreate the group.

### Advanced Settings
Expand the Advanced section to override:
- Min/Max swap amount in SOL
- Min/Max interval between trades (milliseconds)

## Bot Lifecycle

### START
When you click Start on a bot group:

1. **Validates** your vault is unlocked and treasury has enough SOL
2. **Generates** the specified number of burner wallets (named `BotName-W1`, `BotName-W2`, etc.)
3. **Funds** each wallet from your treasury with the configured SOL amount
   - If [Stealth Funding](/features/stealth-funding) is enabled, each wallet is funded through ChangeNow (adds ~2-10 min but breaks clustering)
4. **Starts parallel trading** — each wallet independently executes swaps simultaneously, maximizing organic-looking activity across multiple accounts

### RUNNING
While running, the bot card shows:
- Status badge (green "Running")
- Live swap count and total volume
- Uptime duration
- Expandable details with wallet list and recent trades

### STOP
When you click Stop:

1. **Stops** the trade loop
2. **Sells all tokens** on each bot wallet (Jupiter → PumpFun fallback). If [Ghost Holders](#ghost-holders) is enabled, leaves 1 token dust per wallet.
3. **Sweeps SOL** from each wallet back to treasury (balance minus fee reserve)
4. **Deletes** the burner wallets from your vault
5. Reports actual results (how many wallets swept, tokens sold, etc.)

### Feedback
The stop process reports exactly what happened:
- "3 tokens sold, 5 wallets swept, 5 wallets deleted"
- If any step fails, you'll see: "2/5 wallets swept (3 failed)"

## Ghost Holders

When **Ghost Holders** is enabled in Settings, stopping a bot group sells all tokens _except 1_ on each wallet. The wallets still appear as "holders" on DexScreener, Birdeye, and block explorers — even after the bot stops and SOL is swept back to treasury.

This prevents the visible holder-count drop that happens when bots sell 100% and exit.

- **Toggle**: Settings → Ghost Holders → ON/OFF
- **Dust amount**: 1 token (in human-readable units) left per wallet
- **SOL sweep**: Still happens — only token dust remains
- **Wallet cleanup**: Wallet keys are deleted from your vault; the on-chain token account persists with dust

Ghost Holders applies to both normal Stop and Orphan Recovery Clean Up.

## Orphan Recovery

If you close the browser while bots are running, the wallets still exist in your vault. On next load:

1. TrenchTools detects wallets matching bot name patterns that are in "idle" state
2. Shows **Clean Up** and **Resume** buttons on the bot card

- **Resume**: Picks up where it left off — starts trading with the existing wallets (no re-funding)
- **Clean Up**: Sells tokens, sweeps SOL, deletes wallets (same as Stop lifecycle)

## Recent Trades

Expand any bot card to see its recent trades:
- Buy/sell indicator with color coding
- SOL amount per trade
- Which wallet executed it
- Time ago
- Clickable Solscan link to the transaction

## Active Bots Dashboard Card

The Dashboard displays a live **Active Bots** card showing all running bot groups at a glance — status, swap count, volume, and uptime. Click through to manage individual bots without navigating to the Market Making tab.

## Bot Wallets in Treasury

Bot-generated burner wallets are hidden from the main wallet list in Treasury Manager. They appear in a collapsible **"Bot Wallets"** section at the bottom, grouped by bot name. Each bot wallet has individual Sell Tokens, Sweep SOL, and Copy controls.
