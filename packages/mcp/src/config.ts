import * as os from 'os';
import * as path from 'path';

export interface MCPConfig {
  rpcUrl: string;
  vaultPassword: string;
  jupiterApiKey?: string;
  heliusApiKey?: string;
  vaultPath: string;
  slippageBps: number;
  maxBuySol: number;
}

export function loadConfig(): MCPConfig {
  const rpcUrl = process.env.TRENCH_RPC_URL;
  const vaultPassword = process.env.TRENCH_VAULT_PASSWORD;

  if (!rpcUrl) {
    console.error('Error: TRENCH_RPC_URL is required. Set it in your MCP server env config.');
    process.exit(1);
  }
  if (!vaultPassword || vaultPassword.length < 8) {
    console.error('Error: TRENCH_VAULT_PASSWORD is required (min 8 characters). Set it in your MCP server env config.');
    process.exit(1);
  }

  const vaultPathRaw = process.env.TRENCH_VAULT_PATH || '~/.trenchsniper/vault.json';
  const vaultPath = vaultPathRaw.startsWith('~')
    ? path.join(os.homedir(), vaultPathRaw.slice(1))
    : vaultPathRaw;

  return {
    rpcUrl,
    vaultPassword,
    jupiterApiKey: process.env.TRENCH_JUPITER_API_KEY || undefined,
    heliusApiKey: process.env.TRENCH_HELIUS_API_KEY || undefined,
    vaultPath,
    slippageBps: parseInt(process.env.TRENCH_SLIPPAGE_BPS || '500', 10),
    maxBuySol: parseFloat(process.env.TRENCH_MAX_BUY_SOL || '1.0'),
  };
}
