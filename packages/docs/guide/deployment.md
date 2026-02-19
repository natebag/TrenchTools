# Deployment

Most users should use the **hosted version** at [app.trenchtools.io](https://app.trenchtools.io) — no deployment needed. This guide is for self-hosting TrenchTools on your own infrastructure.

## Quick Start (Local)

The simplest deployment is running locally:

```bash
git clone https://github.com/natebag/Trenchtools.git
cd Trenchtools
pnpm install
pnpm start
```

This runs the dashboard at `http://localhost:5173`. Your data stays in your browser's `localStorage`.

## Production Build

Build the static UI for hosting:

```bash
npx turbo run build --filter=@trenchtools/ui --force
# Output: packages/ui/dist/
```

The `dist/` folder contains a fully static site (HTML + JS + CSS) that can be served by any web server or hosting provider.

## Hosting Options

Since the build output is static files, you can host it anywhere:

| Provider | Setup | Cost |
|----------|-------|------|
| **Vercel** | Connect GitHub repo, zero config | Free |
| **Netlify** | Drop `dist/` folder or connect repo | Free |
| **Cloudflare Pages** | Connect repo, fast global CDN | Free |
| **GitHub Pages** | Push to `gh-pages` branch | Free |
| **Railway** | Connect repo, set build command | ~$5/mo |
| **Your own server** | Serve `dist/` with nginx/caddy | Varies |

## Environment Variables

The UI accepts optional environment variables via Vite:

```env
# Default RPC URL (falls back to public RPC if not set)
VITE_DEFAULT_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Jupiter API key for higher rate limits (optional)
VITE_JUPITER_API_KEY=your-key-here
```

Create a `.env` file in `packages/ui/` before building, or set them in your hosting provider's environment settings.

::: tip
For the best experience self-hosting, use a dedicated RPC from [Helius](https://helius.dev/) or [QuickNode](https://quicknode.com/). Public RPCs have aggressive rate limits that cause failures during volume operations.
:::

## Security Notes

- The static site runs entirely in the browser — no backend server required
- All wallet keys are encrypted locally using AES-256-GCM
- No data is sent to external servers (except RPC calls to Solana and DEX API calls)
- HTTPS is recommended but not required for local use
