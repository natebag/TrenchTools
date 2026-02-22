import { z } from 'zod';
import { Connection } from '@solana/web3.js';
import type { MCPConfig } from '../config.js';
import { ensureUnlocked, getKeypairByAddress, getDefaultWallet } from '../vault.js';
import { launchToken, loadImage, saveLaunchRecord } from '../lib/pumpfun-launch.js';
import { collectFee } from '../lib/fees.js';

export const toolName = 'trench_launch';
export const toolDescription = 'Launch a new token on PumpFun bonding curve. Uploads metadata to IPFS, creates the token, and optionally makes an initial buy.';

export const toolSchema = z.object({
  name: z.string().min(1).max(32).describe('Token name'),
  symbol: z.string().min(1).max(10).describe('Token ticker symbol'),
  description: z.string().min(1).max(500).describe('Token description'),
  imageSource: z.string().describe('Token image: URL (https://...) or local file path'),
  initialBuySol: z.number().min(0).max(85).optional().describe('Initial buy in SOL (dev buy). 0 or omit for no buy.'),
  walletAddress: z.string().optional().describe('Creator wallet. Omit for default vault wallet.'),
  twitter: z.string().optional().describe('Twitter/X URL'),
  telegram: z.string().optional().describe('Telegram URL'),
  website: z.string().optional().describe('Website URL'),
  slippagePct: z.number().min(1).max(100).optional().describe('Slippage for initial buy (default 50%)'),
  priorityFee: z.number().min(0).max(0.1).optional().describe('Priority fee in SOL (default 0.001)'),
});

export type ToolInput = z.infer<typeof toolSchema>;

export async function handler(args: ToolInput, config: MCPConfig) {
  // Get wallet from vault
  const wallets = await ensureUnlocked(config);
  let walletAddress: string;
  if (args.walletAddress) {
    walletAddress = args.walletAddress;
  } else {
    const defaultWallet = getDefaultWallet(wallets);
    walletAddress = defaultWallet.publicKey;
  }
  const keypair = getKeypairByAddress(wallets, walletAddress);

  // Load image
  let imageBuffer: Buffer;
  let imageFilename: string;
  try {
    const image = await loadImage(args.imageSource);
    imageBuffer = image.buffer;
    imageFilename = image.filename;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Failed to load image from "${args.imageSource}": ${msg}`,
      }],
    };
  }

  // Check image size (max 10MB)
  const maxImageSize = 10 * 1024 * 1024;
  if (imageBuffer.length > maxImageSize) {
    return {
      content: [{
        type: 'text' as const,
        text: `Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)`,
      }],
    };
  }

  // Launch token
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const result = await launchToken(connection, {
    creatorKeypair: keypair,
    metadata: {
      name: args.name,
      symbol: args.symbol,
      description: args.description,
      twitter: args.twitter,
      telegram: args.telegram,
      website: args.website,
    },
    imageBuffer,
    imageFilename,
    initialBuySol: args.initialBuySol,
    slippagePct: args.slippagePct,
    priorityFee: args.priorityFee,
  });

  if (!result.success) {
    return {
      content: [{
        type: 'text' as const,
        text: `Token launch failed: ${result.error}`,
      }],
    };
  }

  // Save to launch registry (protects wallet from accidental deletion)
  try {
    await saveLaunchRecord(walletAddress, result.mintAddress!, args.name, args.symbol);
  } catch { /* registry failure should not fail the launch */ }

  // Collect fee in hosted mode (post-swap SOL transfer) if there was an initial buy
  let feeTx: string | null = null;
  if (config.feeAccount && config.feeBps && args.initialBuySol && args.initialBuySol > 0) {
    try {
      feeTx = await collectFee(connection, keypair, args.initialBuySol, config.feeAccount, config.feeBps);
    } catch { /* fee failure should not fail the launch */ }
  }

  const lines: string[] = [];
  lines.push(`Token launched successfully!`);
  lines.push('');
  lines.push(`  Name: ${args.name}`);
  lines.push(`  Symbol: $${args.symbol}`);
  lines.push(`  Mint: ${result.mintAddress}`);
  lines.push(`  Creator: ${walletAddress.slice(0, 8)}...`);
  if (args.initialBuySol && args.initialBuySol > 0) {
    lines.push(`  Dev buy: ${args.initialBuySol} SOL`);
  }
  lines.push(`  Metadata: ${result.metadataUri}`);
  lines.push('');
  lines.push(`  PumpFun: https://pump.fun/${result.mintAddress}`);
  lines.push(`  Solscan: https://solscan.io/tx/${result.txHash}`);
  if (feeTx) {
    lines.push(`  Fee tx: ${feeTx}`);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
