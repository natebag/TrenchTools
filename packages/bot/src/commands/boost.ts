import { Context } from 'grammy';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  detectTokenVenues,
  getPumpSwapCanonicalFeeProfile,
  estimateRunout,
} from '@trenchtools/core';
import { stateManager } from '../state/index.js';

function isValidSolanaMint(address: string): boolean {
  // Basic validation: Solana addresses are base58 encoded, 32-44 chars
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

const BOT_DEFAULT_MIN_SWAP_SOL = 0.1;
const BOT_DEFAULT_MAX_SWAP_SOL = 0.6;
const BOT_SOL_RESERVE_PER_WALLET = 0.005;
const BOT_DEFAULT_TX_FEE_SOL = 0.00005;
const DEFAULT_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

function formatPctFromBps(bps: number): string {
  return `${(bps / 100).toFixed(3)}%`;
}

async function buildPreflightSummary(tokenMint: string): Promise<string> {
  const rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_MAINNET_RPC;
  const txFeeSol = parseFloat(process.env.VOLUME_ESTIMATED_TX_FEE_SOL || `${BOT_DEFAULT_TX_FEE_SOL}`);
  const wallets = stateManager.getWallets();
  const totalSol = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  const usableSol = wallets.reduce((sum, wallet) => sum + Math.max(0, wallet.balance - BOT_SOL_RESERVE_PER_WALLET), 0);
  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(tokenMint);

  const [venues, feeProfile] = await Promise.all([
    detectTokenVenues(connection, mint),
    getPumpSwapCanonicalFeeProfile(connection, mint),
  ]);

  const estimate = estimateRunout({
    usableSol,
    minSwapSol: BOT_DEFAULT_MIN_SWAP_SOL,
    maxSwapSol: BOT_DEFAULT_MAX_SWAP_SOL,
    txFeeSol,
    creatorFeeBps: feeProfile.selectedFeesBps.creatorFeeBps,
    protocolFeeBps: feeProfile.selectedFeesBps.protocolFeeBps,
    lpFeeBps: feeProfile.selectedFeesBps.lpFeeBps,
  });

  const feeSource =
    feeProfile.selectedFeeSource === 'canonical_tier'
      ? 'canonical PumpSwap tier'
      : feeProfile.selectedFeeSource === 'flat_fees'
        ? 'flat PumpSwap fees'
        : 'fallback flat fees';

  const warningLine = feeProfile.isCanonicalPool
    ? ''
    : '\n⚠️ Not confirmed canonical PumpSwap pool. Estimate uses flat fee fallback.';

  return (
    `📐 *Preflight Estimate*\n` +
    `• Venue: PumpFun ${venues.isOnPumpFunBondingCurve ? '✅' : '❌'} | PumpSwap canonical ${venues.hasPumpSwapCanonicalPool ? '✅' : '❌'} | Raydium ${venues.hasRaydiumPool ? '✅' : '❌'}\n` +
    `• Fee source: ${feeSource}\n` +
    `• Fees: creator ${formatPctFromBps(feeProfile.selectedFeesBps.creatorFeeBps)} / protocol ${formatPctFromBps(feeProfile.selectedFeesBps.protocolFeeBps)} / LP ${formatPctFromBps(feeProfile.selectedFeesBps.lpFeeBps)} (total ${formatPctFromBps(feeProfile.selectedFeesBps.totalFeeBps)})\n` +
    `• Capital: total ${totalSol.toFixed(4)} SOL, usable ${estimate.usableSol.toFixed(4)} SOL\n` +
    `• Projection: ${estimate.projectedVolumeSol.toFixed(2)} SOL over ~${estimate.maxSwaps.toLocaleString()} swaps (${estimate.volumeMultiplier.toFixed(2)}x)\n` +
    `• Creator reinvest (until bust): +${estimate.creatorReinvestedVolumeSol.toFixed(2)} SOL over ~${estimate.creatorReinvestedSwaps.toLocaleString()} swaps (total ${estimate.totalProjectedVolumeWithCreatorReinvestSol.toFixed(2)} SOL, ${estimate.volumeMultiplierWithCreatorReinvest.toFixed(2)}x)\n` +
    `• Losses: creator ${estimate.creatorLossSol.toFixed(4)}, protocol ${estimate.protocolLossSol.toFixed(4)}, LP ${estimate.lpLossSol.toFixed(4)}, network ${estimate.networkLossSol.toFixed(4)} SOL\n` +
    `• Total loss: ${estimate.totalLossSol.toFixed(4)} SOL | Theoretical max (no tx): ${estimate.theoreticalMaxVolumeSol.toFixed(2)} SOL` +
    warningLine
  );
}

export async function startBoostCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text || '';
  const parts = text.split(/\s+/);
  
  if (parts.length < 2) {
    await ctx.reply(
      '❌ *Usage:* `/start_boost <token_mint>`\n\n' +
      'Example:\n`/start_boost 7xKXtFpNQ9mDxv3qL8cMp2Z4hT5nY1rK8aW9bX6jMn`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const tokenMint = parts[1];

  if (!isValidSolanaMint(tokenMint)) {
    await ctx.reply(
      '❌ *Invalid token mint address*\n\n' +
      'Please provide a valid Solana mint address\\.',
      { parse_mode: 'MarkdownV2' }
    );
    return;
  }

  let preflightSummary = '';
  try {
    preflightSummary = await buildPreflightSummary(tokenMint);
  } catch (error) {
    preflightSummary = `⚠️ Preflight estimate unavailable: ${(error as Error).message}`;
  }

  const result = stateManager.startBoost(tokenMint);

  if (result.success) {
    await ctx.reply(
      `🚀 *Boost Started!*\n\n` +
      `*Token:* \`${tokenMint}\`\n\n` +
      `${preflightSummary}\n\n` +
      `Volume boosting is now active. Use /status to monitor progress.\n\n` +
      `💡 Tip: Enable /alerts on to receive trade notifications.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `❌ *Failed to start boost*\n\n${result.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

export async function stopBoostCommand(ctx: Context): Promise<void> {
  const result = stateManager.stopBoost();

  if (result.success && result.stats) {
    const stats = result.stats;
    const duration = stats.startedAt 
      ? Math.floor((Date.now() - stats.startedAt.getTime()) / 1000 / 60)
      : 0;

    await ctx.reply(
      `🛑 *Boost Stopped*\n\n` +
      `*Session Summary:*\n` +
      `• Duration: ${duration} minutes\n` +
      `• Volume Generated: ${stats.volumeGenerated.toFixed(4)} SOL\n` +
      `• Trades Executed: ${stats.tradesExecuted}\n` +
      `• Success Rate: ${stats.successRate.toFixed(1)}%\n` +
      `• SOL Spent: ${stats.solSpent.toFixed(4)}\n\n` +
      `Ready for next session\\. Use /start\\_boost to begin\\.`,
      { parse_mode: 'MarkdownV2' }
    );
  } else {
    await ctx.reply(
      `❌ ${result.message}\n\nUse /start_boost <token> to begin a session.`,
      { parse_mode: 'Markdown' }
    );
  }
}
