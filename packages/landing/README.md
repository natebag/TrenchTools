# @trenchsniper/landing

Marketing landing page for TrenchSniper OS.

## Development

```bash
# Install dependencies (from root)
pnpm install

# Start dev server
pnpm --filter @trenchsniper/landing dev
```

## Build

```bash
pnpm --filter @trenchsniper/landing build
```

## Deploy to Vercel

1. Connect your GitHub repo to Vercel
2. Set the root directory to `packages/landing`
3. Vercel will auto-detect the Vite configuration

Or use the CLI:

```bash
cd packages/landing
vercel
```

## Tech Stack

- React 18
- Vite
- TailwindCSS
- TypeScript
- Lucide Icons

## Structure

```
src/
  App.tsx       # Main landing page component
  main.tsx      # Entry point
  index.css     # Tailwind styles
public/
  favicon.svg   # Site favicon
```
