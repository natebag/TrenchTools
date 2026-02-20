#!/usr/bin/env npx tsx
/**
 * Houdini CORS Proxy — run locally when browser→Houdini direct calls are blocked by CORS.
 *
 * Usage:
 *   HOUDINI_API_KEY=xxx HOUDINI_API_SECRET=yyy npx tsx scripts/houdini-proxy.ts
 *
 * The proxy listens on http://localhost:3456/houdini/* and forwards to Houdini's partner API
 * with your credentials injected. The browser Houdini client can be pointed at this proxy
 * by setting localStorage key `houdini_proxy_url` to `http://localhost:3456/houdini`.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';

const PORT = parseInt(process.env.HOUDINI_PROXY_PORT || '3456', 10);
const API_KEY = process.env.HOUDINI_API_KEY;
const API_SECRET = process.env.HOUDINI_API_SECRET;
const UPSTREAM = 'https://api-partner.houdiniswap.com';

if (!API_KEY || !API_SECRET) {
  console.error('Error: HOUDINI_API_KEY and HOUDINI_API_SECRET env vars are required');
  process.exit(1);
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/houdini/, '');
  const upstream = `${UPSTREAM}${path}${url.search}`;

  try {
    // Read request body
    let body: string | undefined;
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks).toString();
    }

    const resp = await fetch(upstream, {
      method: req.method || 'GET',
      headers: {
        authorization: `${API_KEY}:${API_SECRET}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await resp.text();
    res.writeHead(resp.status, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`Houdini CORS proxy running on http://localhost:${PORT}/houdini/*`);
  console.log(`Set localStorage key "houdini_proxy_url" to "http://localhost:${PORT}/houdini" in your browser`);
});
