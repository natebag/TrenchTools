# Deployment

## Deploying the Docs Site

The docs site (`packages/docs`) builds to static HTML using VitePress. It can be hosted on any static hosting provider.

### Railway (Recommended)

Since you're already hosting the landing page on Railway, the docs site fits naturally there too.

#### Option 1: Nixpacks (Auto-detect)

Railway auto-detects Node.js projects. Create a new Railway service pointed at the monorepo:

1. Create a new service in your Railway project
2. Connect your GitHub repo
3. Set the **Root Directory** to `packages/docs`
4. Set the **Build Command**: `npm install -g pnpm && pnpm install && pnpm build`
5. Set the **Start Command**: `npx serve .vitepress/dist -l 3000`
6. Add custom domain: `docs.trenchtools.io`

#### Option 2: Dockerfile

Create a `Dockerfile` in `packages/docs/`:

```dockerfile
FROM node:20-alpine AS build
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Then in Railway:
1. Create a new service → Dockerfile
2. Set root directory to `packages/docs`
3. Railway builds and deploys the nginx container
4. Add custom domain: `docs.trenchtools.io`

#### Option 3: Static Site Deploy

```bash
cd packages/docs
pnpm install
pnpm build
# Upload .vitepress/dist/ to Railway as a static site
```

### DNS Setup

Point `docs.trenchtools.io` to Railway:
1. In Railway, add the custom domain to your docs service
2. Railway provides a CNAME target (e.g., `xxx.up.railway.app`)
3. In your DNS provider, add:
   ```
   CNAME  docs  →  xxx.up.railway.app
   ```
4. Wait for DNS propagation and SSL provisioning

### Alternative Hosts

VitePress outputs static HTML, so it works on:
- **Vercel**: Zero-config with framework detection
- **Netlify**: Drop the `dist` folder or connect repo
- **Cloudflare Pages**: Free, fast global CDN
- **GitHub Pages**: Free for public repos

## Deploying the UI

The main dashboard (`packages/ui`) also builds to static files:

```bash
npx turbo run build --filter=@trenchtools/ui --force
# Output: packages/ui/dist/
```

This can be hosted the same way, but since TrenchSniper OS is self-hosted by design, most users will run `pnpm start` locally.

## Environment Variables

For the docs site, no environment variables are needed — it's pure static content.

For the UI, if hosting publicly:
```env
VITE_DEFAULT_RPC_URL=https://api.mainnet-beta.solana.com
VITE_JUPITER_API_KEY=your-key-here
```
