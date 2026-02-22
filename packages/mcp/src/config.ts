import * as os from 'os';
import * as path from 'path';

const DEFAULT_API_URL = 'https://api.trenchtools.io';

export interface MCPConfig {
  rpcUrl: string;
  vaultPassword: string;
  jupiterApiKey?: string;
  heliusApiKey?: string;
  vaultPath: string;
  slippageBps: number;
  maxBuySol: number;
  changeNowApiKey?: string;
  // Hosted mode fields (default)
  apiUrl: string;         // defaults to api.trenchtools.io
  apiKey?: string;        // optional — for future account-linked features
  isHosted: boolean;      // true unless TRENCH_SELF_HOSTED=true
  // Runtime fields populated from /api/config:
  hostedRpcUrl?: string;
  feeAccount?: string;
  feeBps?: number;
}

export function loadConfig(): MCPConfig {
  const vaultPassword = process.env.TRENCH_VAULT_PASSWORD;
  const selfHosted = process.env.TRENCH_SELF_HOSTED === 'true';
  const apiUrl = process.env.TRENCH_API_URL || DEFAULT_API_URL;
  const apiKey = process.env.TRENCH_API_KEY || undefined;
  const rpcUrl = process.env.TRENCH_RPC_URL || '';
  const isHosted = !selfHosted;

  if (!vaultPassword || vaultPassword.length < 8) {
    console.error('Error: TRENCH_VAULT_PASSWORD is required (min 8 characters). Set it in your MCP server env config.');
    process.exit(1);
  }

  // Self-hosted mode requires an RPC URL
  if (!isHosted && !rpcUrl) {
    console.error('Error: TRENCH_RPC_URL is required for self-hosted mode.');
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
    changeNowApiKey: process.env.TRENCH_CHANGENOW_API_KEY || undefined,
    apiUrl,
    apiKey,
    isHosted,
  };
}
