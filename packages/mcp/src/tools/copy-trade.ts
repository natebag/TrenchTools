import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { fetchTrades } from '@trenchtools/core';
import type { CopyTradeConfig, CopyTradeExecution, WalletTrade } from '@trenchtools/core';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getDefaultWallet, getKeypairByAddress } from '../vault.js';
import { detectDex, getQuote, executeSwap } from '../lib/dex/index.js';
import { KNOWN_MINTS } from '../lib/dex/types.js';
import type { DexConfig } from '../lib/dex/types.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_copy_trade';
export const toolDescription = 'Copy-trade a Solana wallet in real-time. Polls for new trades every 30s and auto-executes matching buys/sells. Actions: start, stop, status, history.';

export const toolSchema = z.object({
  action: z.enum(['start', 'stop', 'status', 'history']).describe('Action: start copy-trading, stop copy-trading, view active status, or view execution history'),
  address: z.string().optional().describe('Solana wallet address to copy-trade (required for start/stop)'),
  label: z.string().optional().describe('Friendly label for the tracked wallet (used with start)'),
  amountSol: z.number().positive().optional().describe('Amount of SOL per copy-trade buy (default: 0.1)'),
  copyBuys: z.boolean().optional().describe('Copy buy trades (default: true)'),
  copySells: z.boolean().optional().describe('Copy sell trades (default: false)'),
  slippageBps: z.number().int().min(1).max(5000).optional().describe('Slippage tolerance in basis points (default: 500)'),
  limit: z.number().int().min(1).max(50).optional().describe('Max history entries to return (default: 20, max: 50)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

// ── Module-level persistent state ──

interface ActiveCopyTrade {
  address: string;
  label: string;
  config: CopyTradeConfig;
  interval: ReturnType<typeof setInterval>;
  knownSignatures: Set<string>;
  copiedSignatures: Set<string>;
  rateLimiter: number[]; // timestamps of recent copies
  firstPoll: boolean;
}

const activeCopyTrades = new Map<string, ActiveCopyTrade>();
const executionHistory: CopyTradeExecution[] = [];
const MAX_HISTORY = 200;

// ── Helpers ──

function generateId(): string {
  return `ct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDexConfig(config: MCPConfig, slippageBps: number): DexConfig {
  return {
    rpcUrl: config.rpcUrl,
    apiKey: config.jupiterApiKey,
    slippageBps,
    heliusApiKey: config.heliusApiKey,
    hostedApiUrl: config.apiUrl,
    hostedApiKey: config.apiKey,
    feeAccount: config.feeAccount,
    feeBps: config.feeBps,
  };
}

async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  tokenMint: string,
): Promise<bigint> {
  const tokenAccounts = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { account } of tokenAccounts.value) {
    const data = account.data;
    const mintBytes = data.subarray(0, 32);
    const mint = new PublicKey(mintBytes).toBase58();

    if (mint === tokenMint) {
      const amountBuf = data.subarray(64, 72);
      return amountBuf.readBigUInt64LE(0);
    }
  }

  return 0n;
}

function isRateLimited(ct: ActiveCopyTrade): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  // Purge old entries
  ct.rateLimiter = ct.rateLimiter.filter(ts => ts > oneMinuteAgo);
  return ct.rateLimiter.length >= ct.config.maxCopiesPerMinute;
}

function recordRateLimit(ct: ActiveCopyTrade): void {
  ct.rateLimiter.push(Date.now());
}

function addExecution(exec: CopyTradeExecution): void {
  executionHistory.unshift(exec);
  if (executionHistory.length > MAX_HISTORY) executionHistory.length = MAX_HISTORY;
}

// ── Core polling logic ──

async function pollAndCopy(address: string, mcpConfig: MCPConfig): Promise<void> {
  const ct = activeCopyTrades.get(address);
  if (!ct) return;

  try {
    const trades = await fetchTrades(address, mcpConfig.heliusApiKey, 20);
    if (trades.length === 0) return;

    // First-poll guard: seed known signatures without copying
    if (ct.firstPoll) {
      for (const trade of trades) {
        ct.knownSignatures.add(trade.signature);
      }
      ct.firstPoll = false;
      return;
    }

    // Find new trades (not yet seen)
    const newTrades = trades.filter(t => !ct.knownSignatures.has(t.signature));
    if (newTrades.length === 0) return;

    // Mark all as known
    for (const trade of newTrades) {
      ct.knownSignatures.add(trade.signature);
    }

    // Process each new trade
    for (const trade of newTrades) {
      // Skip if already copied
      if (ct.copiedSignatures.has(trade.signature)) continue;

      // Skip if trade type not configured
      if (trade.type === 'buy' && !ct.config.copyBuys) continue;
      if (trade.type === 'sell' && !ct.config.copySells) continue;

      // Rate limiting
      if (isRateLimited(ct)) {
        addExecution({
          id: generateId(),
          trackedWalletAddress: ct.address,
          trackedWalletLabel: ct.label,
          originalSignature: trade.signature,
          tokenMint: trade.tokenMint,
          tokenSymbol: trade.tokenSymbol,
          type: trade.type,
          amountSol: ct.config.amountSol,
          status: 'failed',
          error: 'Rate limited (max copies per minute exceeded)',
          timestamp: Date.now(),
        });
        continue;
      }

      // Execute the copy trade
      await executeCopyTrade(ct, trade, mcpConfig);
    }
  } catch (error) {
    // Silently ignore polling errors — will retry next interval
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[copy-trade] Poll error for ${address.slice(0, 6)}...: ${message}`);
  }
}

async function executeCopyTrade(
  ct: ActiveCopyTrade,
  trade: WalletTrade,
  mcpConfig: MCPConfig,
): Promise<void> {
  const execution: CopyTradeExecution = {
    id: generateId(),
    trackedWalletAddress: ct.address,
    trackedWalletLabel: ct.label,
    originalSignature: trade.signature,
    tokenMint: trade.tokenMint,
    tokenSymbol: trade.tokenSymbol,
    type: trade.type,
    amountSol: ct.config.amountSol,
    status: 'pending',
    timestamp: Date.now(),
  };

  try {
    // Get signer wallet from vault
    const wallets = await ensureUnlocked(mcpConfig);
    const defaultWallet = getDefaultWallet(wallets);
    const keypair = getKeypairByAddress(wallets, defaultWallet.publicKey);

    // Auto-detect DEX route
    const dexType = await detectDex(trade.tokenMint, mcpConfig.rpcUrl);
    const dexConfig = getDexConfig(mcpConfig, ct.config.slippageBps);

    if (trade.type === 'buy') {
      // Buy: spend configured SOL amount
      const amountLamports = Math.round(ct.config.amountSol * LAMPORTS_PER_SOL);

      const quote = await getQuote(
        dexType,
        KNOWN_MINTS.WSOL,
        trade.tokenMint,
        amountLamports,
        dexConfig,
      );

      const result = await executeSwap(quote, keypair, dexConfig);

      if (result.success) {
        execution.status = 'success';
        execution.copySignature = result.txHash;
      } else {
        execution.status = 'failed';
        execution.error = result.error || 'Swap returned failure';
      }
    } else {
      // Sell: sell entire token balance
      const connection = new Connection(mcpConfig.rpcUrl, 'confirmed');
      const balance = await getTokenBalance(
        connection,
        keypair.publicKey,
        trade.tokenMint,
      );

      if (balance === 0n) {
        execution.status = 'failed';
        execution.error = 'No token balance to sell';
        addExecution(execution);
        ct.copiedSignatures.add(trade.signature);
        recordRateLimit(ct);
        return;
      }

      const sellAmount = Number(balance);

      const quote = await getQuote(
        dexType,
        trade.tokenMint,
        KNOWN_MINTS.WSOL,
        sellAmount,
        dexConfig,
      );

      const result = await executeSwap(quote, keypair, dexConfig);

      if (result.success) {
        execution.status = 'success';
        execution.copySignature = result.txHash;
        execution.amountSol = (result.outputAmount ?? quote.outputAmount) / LAMPORTS_PER_SOL;
      } else {
        execution.status = 'failed';
        execution.error = result.error || 'Swap returned failure';
      }
    }

    ct.copiedSignatures.add(trade.signature);
    recordRateLimit(ct);
    addExecution(execution);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    execution.status = 'failed';
    execution.error = message;
    ct.copiedSignatures.add(trade.signature);
    addExecution(execution);
  }
}

// ── Handler ──

export async function handler(args: ToolInput, config: MCPConfig) {
  // ── START ──
  if (args.action === 'start') {
    if (!args.address) {
      return { content: [{ type: 'text' as const, text: 'Error: "address" is required for action "start".' }] };
    }

    const address = args.address;

    if (activeCopyTrades.has(address)) {
      const existing = activeCopyTrades.get(address)!;
      return {
        content: [{
          type: 'text' as const,
          text: `Already copy-trading ${existing.label} (${address.slice(0, 6)}...${address.slice(-4)}). Stop first to reconfigure.`,
        }],
      };
    }

    // Validate vault has wallets
    const wallets = await ensureUnlocked(config);
    if (wallets.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No wallets in vault. Use trench_wallet_generate to create one before copy-trading.',
        }],
      };
    }

    const label = args.label || `Wallet ${address.slice(0, 6)}...${address.slice(-4)}`;
    const copyConfig: CopyTradeConfig = {
      enabled: true,
      amountSol: args.amountSol ?? 0.1,
      copyBuys: args.copyBuys ?? true,
      copySells: args.copySells ?? false,
      slippageBps: args.slippageBps ?? 500,
      maxCopiesPerMinute: 3,
    };

    const ct: ActiveCopyTrade = {
      address,
      label,
      config: copyConfig,
      interval: setInterval(() => pollAndCopy(address, config), 30_000),
      knownSignatures: new Set(),
      copiedSignatures: new Set(),
      rateLimiter: [],
      firstPoll: true,
    };

    activeCopyTrades.set(address, ct);

    // Trigger first poll immediately to seed known signatures
    pollAndCopy(address, config).catch(() => {});

    const lines: string[] = [];
    lines.push(`Started copy-trading: ${label}`);
    lines.push('');
    lines.push(`  Address: ${address}`);
    lines.push(`  Buy amount: ${copyConfig.amountSol} SOL`);
    lines.push(`  Copy buys: ${copyConfig.copyBuys ? 'Yes' : 'No'}`);
    lines.push(`  Copy sells: ${copyConfig.copySells ? 'Yes' : 'No'}`);
    lines.push(`  Slippage: ${copyConfig.slippageBps} bps`);
    lines.push(`  Max copies/min: ${copyConfig.maxCopiesPerMinute}`);
    lines.push(`  Poll interval: 30s`);
    lines.push('');
    lines.push('First poll will seed known trades. New trades after that will be copied.');

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }

  // ── STOP ──
  if (args.action === 'stop') {
    if (!args.address) {
      return { content: [{ type: 'text' as const, text: 'Error: "address" is required for action "stop".' }] };
    }

    const address = args.address;
    const ct = activeCopyTrades.get(address);

    if (!ct) {
      return {
        content: [{
          type: 'text' as const,
          text: `Not copy-trading ${address.slice(0, 6)}...${address.slice(-4)}. Nothing to stop.`,
        }],
      };
    }

    clearInterval(ct.interval);
    activeCopyTrades.delete(address);

    const copiedCount = ct.copiedSignatures.size;
    return {
      content: [{
        type: 'text' as const,
        text: `Stopped copy-trading ${ct.label} (${address.slice(0, 6)}...${address.slice(-4)}). ${copiedCount} trade(s) were copied during this session.`,
      }],
    };
  }

  // ── STATUS ──
  if (args.action === 'status') {
    if (activeCopyTrades.size === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No active copy-trades. Use action "start" with an address to begin.',
        }],
      };
    }

    const lines: string[] = [];
    lines.push(`Active copy-trades (${activeCopyTrades.size}):`);
    lines.push('');

    let idx = 1;
    for (const [address, ct] of activeCopyTrades) {
      lines.push(`${idx}. ${ct.label}`);
      lines.push(`   Address: ${address}`);
      lines.push(`   Buy amount: ${ct.config.amountSol} SOL`);
      lines.push(`   Copy buys: ${ct.config.copyBuys ? 'Yes' : 'No'} | Copy sells: ${ct.config.copySells ? 'Yes' : 'No'}`);
      lines.push(`   Slippage: ${ct.config.slippageBps} bps`);
      lines.push(`   Known txs: ${ct.knownSignatures.size} | Copied: ${ct.copiedSignatures.size}`);
      lines.push('');
      idx++;
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }

  // ── HISTORY ──
  if (args.action === 'history') {
    const limit = Math.min(args.limit ?? 20, 50);

    if (executionHistory.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: 'No copy-trade executions yet. Start copy-trading a wallet to see history here.',
        }],
      };
    }

    const entries = executionHistory.slice(0, limit);
    const lines: string[] = [];
    lines.push(`Copy-trade history (${entries.length} of ${executionHistory.length} total):`);
    lines.push('');

    for (const [i, exec] of entries.entries()) {
      const time = new Date(exec.timestamp).toLocaleString();
      const statusIcon = exec.status === 'success' ? 'OK' : exec.status === 'pending' ? '...' : 'FAIL';
      lines.push(`${i + 1}. [${statusIcon}] ${exec.type.toUpperCase()} ${exec.tokenSymbol}`);
      lines.push(`   Tracked: ${exec.trackedWalletLabel}`);
      lines.push(`   Amount: ${exec.amountSol.toFixed(4)} SOL`);
      lines.push(`   Token: ${exec.tokenMint}`);
      if (exec.copySignature) {
        lines.push(`   Tx: https://solscan.io/tx/${exec.copySignature}`);
      }
      if (exec.error) {
        lines.push(`   Error: ${exec.error}`);
      }
      lines.push(`   ${time}`);
      lines.push('');
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  }

  return { content: [{ type: 'text' as const, text: 'Unknown action. Use: start, stop, status, or history.' }] };
}
