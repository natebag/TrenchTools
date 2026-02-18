# TrenchTools - Branding Guide

> **The Operating System for Solana Trench Warfare**
> *Snipe. Boost. Dominate. Open source.*

---

## Brand Overview

**TrenchTools** is an open-source market-making and trading toolkit for Solana token launches. It combines sniping, market making, automated bot groups, wallet management, and portfolio analytics into a single self-hosted dashboard. Built for degens who want institutional-grade tooling without the institutional price tag.

### Core Mission
*"Give every Solana trader the same toolkit the insiders use — open source, self-hosted, no fees."*

### Vision Statement
*"To be the standard operating system for Solana token operations — from launch to liquidity."*

---

## Brand Identity

### What We Are
- **Your Trading OS**: A complete dashboard for every phase of a token's lifecycle
- **Open Source**: Fully transparent, community-auditable, no hidden fees or backdoors
- **Self-Hosted**: Your keys, your RPC, your data — nothing leaves your machine
- **Multi-DEX**: Jupiter, PumpFun, Raydium, Meteora — auto-routes to the right venue
- **Battle-Tested**: Real trades, real volume, real P&L tracking — not a paper trading toy

### What We're NOT
- A hosted SaaS or cloud product — you run it
- A token or a protocol — no governance, no coin, no rugs
- Financial advice — it's a tool, use it at your own risk
- A bot-as-a-service — there's no monthly subscription
- Vaporware — every feature ships with working DEX integration

### Brand Personality
**The Character**: TrenchTools is the quiet operator in the Discord who never calls plays but somehow always has a position before the pump. Technical, understated, efficient. They don't need to flex — the P&L speaks for itself. Think terminal aesthetic meets trading floor energy.

---

## Visual Identity

### Color Palette

| Color | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| **Trench Emerald** | `#10B981` | `emerald-500` | Primary brand, CTAs, active states, profit |
| **Emerald Glow** | `#34D399` | `emerald-400` | Highlights, nav active, glow effects |
| **Deep Emerald** | `#059669` | `emerald-600` | Hover states, pressed buttons |
| **Midnight** | `#020617` | `slate-950` | App background, base |
| **Dark Slate** | `#0F172A` | `slate-900` | Cards, panels, containers |
| **Slate Border** | `#1E293B` | `slate-800` | Borders, dividers, secondary surfaces |
| **Signal Red** | `#EF4444` | `red-500` | Losses, errors, sell actions, danger |
| **Amber Warning** | `#F59E0B` | `amber-500` | Warnings, caution, pending states |
| **Orange Mainnet** | `#F97316` | `orange-500` | Mainnet indicator, high-risk actions |
| **Clean White** | `#F1F5F9` | `slate-100` | Primary text on dark |
| **Muted Gray** | `#94A3B8` | `slate-400` | Secondary text, labels, descriptions |

### Glow Effects
The emerald glow is a signature visual element:
```css
/* Emerald glow on key elements */
box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
text-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
```

### Typography
- **Headlines**: Inter Bold/Semibold — clean, modern, highly readable
- **Body**: Inter Regular/Medium — comfortable reading at any size
- **Data/Addresses/Code**: JetBrains Mono / Fira Code — monospace for wallets, hashes, amounts
- **Emphasis**: Bold sparingly. Never all-caps except token tickers (SOL, USDC)

### Logo Concept
The TrenchTools logo should convey:
- **Precision**: Clean geometric lines, tool/wrench motif
- **Speed**: Forward-leaning, dynamic energy
- **Technical**: Terminal/hacker aesthetic, monospace elements
- **Utility**: A toolkit you reach for — practical, not flashy

Current in-app identity:
- Wrench icon in emerald on the landing page
- Zap icon (lightning bolt) in emerald gradient on the dashboard sidebar
- "TrenchTools" as brand name across landing, GitHub, and packages

Possible logo elements:
- Stylized wrench or tool motif with "TT" monogram
- Emerald gradient wrench with terminal aesthetic
- Terminal cursor `█` integrated into lettermark
- Subtle Solana gradient accent

### Iconography
Uses [Lucide React](https://lucide.dev/) throughout:
- `Zap` — App logo, speed/power
- `Crosshair` — Sniping
- `Volume2` — Market making / volume
- `Wallet` — Wallet management
- `Shield` — Honeypot detection
- `TrendingUp` — P&L, analytics
- `Activity` — Activity generation
- `Bot` — Bot groups
- `Settings` — Configuration
- `Search` — Manipulation detection

---

## Voice & Tone

### Core Voice Attributes

#### Direct & No-BS
We don't waste words. Get to the alpha, deliver the tool, move on.
- **Yes**: "5 wallets funded. Bot running. Volume hitting in 3s intervals."
- **No**: "We're pleased to inform you that the wallet funding operation has been successfully initiated..."

#### Technical but Accessible
We respect the user's intelligence without gatekeeping. Explain when needed, don't over-explain.
- **Yes**: "Auto-detected PumpFun bonding curve. Routing through PumpPortal API."
- **No**: "The system has identified that the token contract exists on the PumpFun decentralized exchange protocol..."

#### Confident but Honest
We show what's working and what's not. No fake success messages.
- **Yes**: "3/5 wallets swept. 2 failed — check console for RPC errors."
- **No**: "All operations completed successfully!" (when they didn't)

#### Understated
The tool does the talking. We don't hype, we ship.
- **Yes**: "New: Bot groups auto-generate wallets, trade, sweep, and clean up on stop."
- **No**: "REVOLUTIONARY AI-POWERED MARKET MAKING ENGINE!!!"

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| **Success** | Brief, factual | "Bought 1.2M tokens via PumpFun. TX confirmed." |
| **Error** | Helpful, specific | "Swap failed — insufficient SOL. Need 0.01 more for fees." |
| **Warning** | Clear, not scary | "Mainnet selected. Real funds will be used." |
| **Status** | Compact, scannable | "Running: 3 bots, 15 wallets, 47 swaps, 4.7 SOL volume" |
| **Empty state** | Encouraging | "No positions yet. Snipe a token to get started." |

---

## Content Guidelines

### UI Copy Rules
1. **Action labels are verbs**: "Start Bot", "Sweep SOL", "Sell All Tokens"
2. **Status badges are adjectives**: "Running", "Idle", "Stopping", "Error"
3. **Numbers are formatted**: Use locale-appropriate separators, 4 decimal places for SOL
4. **Addresses are truncated**: `7xKp...3mFq` — first 4, last 4
5. **Time is relative**: "2m ago", "1h ago" — not raw timestamps
6. **Errors name the cause**: Not "Something went wrong" — say what actually failed

### Social Media Voice

#### Twitter/X
- Lead with what the tool does, not what it is
- Share real usage screenshots (devnet)
- Engage with Solana dev/degen community
- Open source commits and changelogs as content

**Good tweet examples**:
```
shipped bot groups in trenchtools os

create a group → auto-generates wallets → funds from treasury → runs volume → on stop: sells tokens, sweeps SOL, deletes wallets

fully automated. open source.

github.com/...
```

```
pumpfun auto-detection is live.

paste any CA → trenchtools checks if it's still on the bonding curve → routes to pumpportal API or jupiter automatically.

no manual dex selection needed.
```

#### GitHub / README
- Features listed with what they actually do, not marketing fluff
- Screenshots of the real UI
- Clear setup instructions
- Honest about what's implemented vs. stubbed

### Do's and Don'ts

**Do:**
- Show real numbers and real UI
- Credit the tech stack (Solana, Jupiter, PumpFun)
- Be transparent about limitations (Raydium/Meteora stubbed)
- Use consistent terminology across all surfaces
- Keep changelogs detailed and honest

**Don't:**
- Promise guaranteed profits or returns
- Use "AI-powered" unless there's actual ML
- Exaggerate features or hide limitations
- Use excessive emojis in the UI (the app is clean)
- Make it look like a hosted product when it's self-hosted

---

## Key Messaging

### Primary Messages

1. **"The Operating System for Solana Trench Warfare"**
   The headline. We're a complete system, not a single tool.

2. **"Open Source. Self-Hosted. No Fees."**
   The trust differentiator. You own everything.

3. **"Snipe. Boost. Dominate."**
   The action loop. What you actually do with it.

4. **"Your Keys. Your RPC. Your Edge."**
   Security and sovereignty.

5. **"Auto-Routes. Auto-Detects. Auto-Executes."**
   The intelligence — PumpFun vs Jupiter detection, wallet management, etc.

### Taglines & Slogans

- *"The Operating System for Solana Trench Warfare"* (primary)
- *"Snipe. Boost. Dominate."* (action-oriented)
- *"Your Trading Terminal, Open Source"*
- *"Built for the Trenches"*
- *"The Degen's Dashboard"*

### Elevator Pitch (30 seconds)
> "TrenchTools is an open-source, self-hosted trading dashboard for Solana. You snipe tokens, boost volume with multi-wallet bots, track P&L in real time, and detect honeypots — all from one UI. It auto-detects whether a token is on PumpFun or Jupiter and routes accordingly. No hosted service, no fees, no API keys to buy. Just clone, run, and operate."

---

## Content Pillars

### 1. Tooling
The core product. What TrenchTools does and how to use it.
- Feature walkthroughs and screenshots
- Setup guides and configuration tips
- Changelog and release notes

### 2. Alpha
Insights from building trading tools on Solana.
- How PumpFun bonding curves work
- DEX routing strategies
- Volume patterns that look organic vs. obvious

### 3. Open Source
Transparency and community contribution.
- Architecture decisions explained
- Contribution guides
- Code quality and security audits

### 4. Operations
Real-world usage patterns and strategies.
- Bot group configuration examples
- Treasury management workflows
- Risk management (slippage, fees, MEV protection)

---

## Competitive Positioning

### vs. Paid Trading Bots (BonkBot, Trojan, etc.)
**TrenchTools advantage**: Free, open source, self-hosted, no revenue share, full control

### vs. Manual Trading (Jupiter UI, PumpFun site)
**TrenchTools advantage**: Multi-wallet, automated volume, bot groups, P&L tracking, all-in-one

### vs. Custom Scripts
**TrenchTools advantage**: Full UI, no coding required, persistent config, real-time feedback

### vs. Institutional Tools
**TrenchTools advantage**: Free, Solana-native, degen-friendly UX, no KYC or onboarding

---

## Brand Assets Checklist

### Essential
- [ ] Logo (full wordmark, icon-only, monochrome versions)
- [ ] Color palette finalized (emerald/slate system)
- [ ] Typography confirmed (Inter + JetBrains Mono)
- [ ] App icon / favicon
- [ ] Social media profile images
- [ ] Banner images for Twitter / GitHub
- [ ] Open Graph images for link previews

### Extended
- [ ] Feature screenshots (Dashboard, Sniper, Volume, Bots, Wallets, P&L)
- [ ] Architecture diagram
- [ ] Demo GIF / video walkthrough
- [ ] Sticker pack / memes for community
- [ ] Branded terminal themes
- [ ] Documentation site design system

---

## Evolution & Consistency

This branding guide is a living document. As TrenchTools grows:

1. **Stay consistent** with the emerald/slate visual system
2. **Keep the tone** technical, understated, and honest
3. **Ship features** before marketing them
4. **Document everything** — the docs site is a first-class product
5. **Listen to users** — the best features come from real usage

The goal is a brand that feels like a professional trading terminal — not a hyped-up DeFi project. Clean, fast, trustworthy.

---

*"The trenches don't care about your branding. Ship the tool, let the P&L talk."*
