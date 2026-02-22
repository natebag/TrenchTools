import { z } from 'zod';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked } from '../vault.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const toolName = 'trench_positions';
export const toolDescription = 'Show current token holdings across vault wallets with live prices from DexScreener. Useful for checking portfolio value.';

export const toolSchema = z.object({
  walletAddress: z.string().optional().describe('Specific wallet address. Omit to scan all vault wallets.'),
  tokenMint: z.string().optional().describe('Filter to a specific token mint. Omit to show all tokens.'),
});

export type ToolInput = z.infer<typeof toolSchema>;

interface DexScreenerPair {
  baseToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
}

async function fetchTokenPrice(mint: string): Promise<{ priceNative: number; priceUsd: number; symbol: string; name: string } | null> {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!resp.ok) return null;
    const data = await resp.json() as { pairs: DexScreenerPair[] | null };
    if (!data.pairs || data.pairs.length === 0) return null;
    const pair = data.pairs[0];
    return {
      priceNative: parseFloat(pair.priceNative),
      priceUsd: parseFloat(pair.priceUsd),
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
    };
  } catch {
    return null;
  }
}

interface TokenHolding {
  mint: string;
  rawAmount: bigint;
  walletAddress: string;
}

export async function handler(args: ToolInput, config: MCPConfig) {
  const wallets = await ensureUnlocked(config);
  const connection = new Connection(config.rpcUrl, 'confirmed');

  // Determine which wallets to scan
  let scanAddresses: string[];
  if (args.walletAddress) {
    scanAddresses = [args.walletAddress];
  } else {
    scanAddresses = wallets.map(w => w.publicKey);
  }

  if (scanAddresses.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: 'No wallets in vault. Use trench_wallet_generate to create wallets.',
      }],
    };
  }

  // Collect all token holdings
  const holdings: TokenHolding[] = [];

  for (const addr of scanAddresses) {
    try {
      const pubkey = new PublicKey(addr);
      const tokenAccounts = await connection.getTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID,
      });

      for (const { account } of tokenAccounts.value) {
        const data = account.data;
        const mintBytes = data.subarray(0, 32);
        const mint = new PublicKey(mintBytes).toBase58();
        const amountBuf = data.subarray(64, 72);
        const rawAmount = amountBuf.readBigUInt64LE(0);

        if (rawAmount === 0n) continue;
        if (args.tokenMint && mint !== args.tokenMint) continue;

        holdings.push({ mint, rawAmount, walletAddress: addr });
      }
    } catch {
      // Skip wallets that fail
    }
  }

  if (holdings.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: args.tokenMint
          ? `No holdings found for token ${args.tokenMint}.`
          : 'No token holdings found across vault wallets.',
      }],
    };
  }

  // Aggregate by mint for price fetching
  const uniqueMints = [...new Set(holdings.map(h => h.mint))];

  // Fetch prices for all unique mints (with concurrency limit)
  const priceMap = new Map<string, Awaited<ReturnType<typeof fetchTokenPrice>>>();
  const BATCH_SIZE = 5;
  for (let i = 0; i < uniqueMints.length; i += BATCH_SIZE) {
    const batch = uniqueMints.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(mint => fetchTokenPrice(mint)));
    for (let j = 0; j < batch.length; j++) {
      priceMap.set(batch[j], results[j]);
    }
  }

  // Format output
  const lines: string[] = [];
  lines.push('Token Positions');
  lines.push('');
  lines.push('  Token          Wallet       Amount              Value (SOL)     Value (USD)');
  lines.push('  -------------- ------------ ------------------- --------------- ---------------');

  let totalValueSol = 0;
  let totalValueUsd = 0;

  for (const holding of holdings) {
    const price = priceMap.get(holding.mint);
    const symbol = price?.symbol ?? holding.mint.slice(0, 6) + '...';
    const walletTrunc = holding.walletAddress.slice(0, 4) + '...' + holding.walletAddress.slice(-4);

    // Assume 6 decimals (PumpFun standard, common for memecoins)
    const tokenAmount = Number(holding.rawAmount) / 1_000_000;
    const amountStr = tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 2 });

    let valueSolStr = '?';
    let valueUsdStr = '?';

    if (price) {
      const valueSol = tokenAmount * price.priceNative;
      const valueUsd = tokenAmount * price.priceUsd;
      totalValueSol += valueSol;
      totalValueUsd += valueUsd;
      valueSolStr = `${valueSol.toFixed(4)} SOL`;
      valueUsdStr = `$${valueUsd.toFixed(2)}`;
    }

    lines.push(`  ${symbol.padEnd(14)} ${walletTrunc.padEnd(12)} ${amountStr.padStart(19)} ${valueSolStr.padStart(15)} ${valueUsdStr.padStart(15)}`);
  }

  lines.push('');
  lines.push(`  Total: ${totalValueSol.toFixed(4)} SOL (~$${totalValueUsd.toFixed(2)})`);
  lines.push(`  Positions: ${holdings.length} across ${scanAddresses.length} wallet(s)`);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
