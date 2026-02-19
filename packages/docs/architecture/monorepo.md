# Monorepo Structure

TrenchTools uses a pnpm workspace with Turbo for build orchestration.

## Workspace Layout

```
TrenchTools/
├── packages/
│   ├── core/            # @trenchtools/core — TypeScript library
│   ├── ui/              # @trenchtools/ui — React dashboard (main app)
│   ├── docs/            # @trenchtools/docs — This documentation site
│   └── landing/         # Landing page (trenchtools.io)
├── package.json         # Workspace root
├── pnpm-workspace.yaml  # Workspace definition
├── turbo.json           # Build pipeline config
└── tsconfig.json        # Root TypeScript config
```

## Build Pipeline

```bash
# Build everything
pnpm build              # → turbo run build

# Build specific package
npx turbo run build --filter=@trenchtools/ui --force

# Development
pnpm start              # → pnpm --filter @trenchtools/ui dev
pnpm dev                # → turbo run dev (all packages)
```

### Build Order
Turbo handles dependency ordering:
1. `@trenchtools/core` builds first (tsup)
2. `@trenchtools/ui` builds second (depends on core, uses tsc + vite)
3. Other packages build in parallel where possible

## Core Package

**Build tool**: tsup (TypeScript bundler)

```
packages/core/src/
├── wallet/          # Keypair generation, encryption
├── snipe/           # Sniping logic (Raydium, PumpFun)
├── sniper-guard/    # Auto-sell engine
├── trading/         # Trade types and interfaces
├── pnl/             # P&L calculation
├── shield/          # Honeypot detection
├── detection/       # Manipulation detection (Allium)
├── activity/        # Activity generation
├── volume/          # Volume estimation, PumpSwap detection
├── treasury/        # Treasury management
├── orchestrator/    # Bot scheduling
├── browser/         # Browser-compatible crypto (Web Crypto API)
├── revenue/         # Fee management
├── supply/          # Token burning
├── liquidity/       # LP locking
└── logger.ts        # Structured logging
```

**Exports** (subpath exports in package.json):
```
@trenchtools/core           → dist/index.js
@trenchtools/core/wallet    → dist/wallet/index.js
@trenchtools/core/snipe     → dist/snipe/index.js
@trenchtools/core/trading   → dist/trading/index.js
@trenchtools/core/browser   → dist/browser/index.js
```

## UI Package

**Build tool**: tsc + vite

```
packages/ui/src/
├── components/      # React components (22+)
├── context/         # Context providers (6)
├── hooks/           # Custom hooks
├── lib/             # Libraries
│   ├── dex/         # DEX abstraction layer
│   └── browserWallet.ts
├── types/           # TypeScript type definitions
├── index.css        # Global styles + Tailwind
└── main.tsx         # App entry point
```

## Adding a New Package

1. Create `packages/new-package/` with a `package.json`
2. Set the name to `@trenchtools/new-package`
3. Add build/dev scripts
4. It's automatically included via `pnpm-workspace.yaml` (`packages/*` glob)
5. Reference it from other packages: `"@trenchtools/new-package": "workspace:*"`
