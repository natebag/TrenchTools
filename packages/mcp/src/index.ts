#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { registerAllTools } from './tools/index.js';

const config = loadConfig();

// Hosted mode: fetch RPC URL + fee config from the hosted API
if (config.isHosted) {
  try {
    const resp = await fetch(`${config.apiUrl}/api/config`, {
      headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {},
    });
    if (!resp.ok) {
      console.error(`Failed to fetch hosted config: ${resp.status} ${resp.statusText}`);
      process.exit(1);
    }
    const hostedConfig = await resp.json() as { rpcUrl: string; feeAccount: string; feeBps: number };
    config.hostedRpcUrl = hostedConfig.rpcUrl;
    config.feeAccount = hostedConfig.feeAccount;
    config.feeBps = hostedConfig.feeBps;
    // Use hosted RPC if no self-hosted RPC was provided
    if (!config.rpcUrl) {
      config.rpcUrl = hostedConfig.rpcUrl;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to connect to hosted API at ${config.apiUrl}: ${message}`);
    process.exit(1);
  }
}

const server = new McpServer(
  { name: 'trenchsniper', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

registerAllTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);
