import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const DEFAULT_API_URL = 'https://api.trenchtools.io';
const TRENCH_DIR = path.join(os.homedir(), '.trenchsniper');
const CONFIG_FILE = path.join(TRENCH_DIR, 'config.json');

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

/**
 * Get or create the vault password.
 * Priority: env var > stored config > auto-generate on first run.
 */
function resolveVaultPassword(): string {
  // 1. Explicit env var always wins
  const envPassword = process.env.TRENCH_VAULT_PASSWORD;
  if (envPassword && envPassword.length >= 8) {
    return envPassword;
  }

  // 2. Check for stored password from a previous run
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const stored = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (stored.vaultPassword && stored.vaultPassword.length >= 8) {
        return stored.vaultPassword;
      }
    }
  } catch {
    // Corrupted config — regenerate
  }

  // 3. First run — auto-generate and store
  const generated = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(TRENCH_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ vaultPassword: generated }, null, 2), { mode: 0o600 });
  console.error(`[trenchsniper] First run — vault password auto-generated and saved to ${CONFIG_FILE}`);
  console.error(`[trenchsniper] Back up this file if you want to recover your wallets later.`);
  return generated;
}

export function loadConfig(): MCPConfig {
  const vaultPassword = resolveVaultPassword();
  const selfHosted = process.env.TRENCH_SELF_HOSTED === 'true';
  const apiUrl = process.env.TRENCH_API_URL || DEFAULT_API_URL;
  const apiKey = process.env.TRENCH_API_KEY || undefined;
  const rpcUrl = process.env.TRENCH_RPC_URL || '';
  const isHosted = !selfHosted;

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
