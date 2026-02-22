import { Context } from 'grammy';
import { Connection } from '@solana/web3.js';
import { ensureUnlocked, getDefaultWallet, getKeypairByAddress } from '../lib/vault.js';
import { claimCreatorFees } from '../lib/launch.js';

export async function claimFeesCommand(ctx: Context): Promise<void> {
  const vaultPassword = process.env.TRENCH_VAULT_PASSWORD;
  if (!vaultPassword) {
    await ctx.reply('TRENCH_VAULT_PASSWORD not set. Configure vault access first.');
    return;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    await ctx.reply('SOLANA_RPC_URL not set.');
    return;
  }

  await ctx.reply('Claiming creator fees...');

  try {
    const vaultPath = process.env.TRENCH_VAULT_PATH;
    const wallets = await ensureUnlocked(vaultPassword, vaultPath);
    const defaultWallet = getDefaultWallet(wallets);
    const keypair = getKeypairByAddress(wallets, defaultWallet.publicKey);
    const connection = new Connection(rpcUrl, 'confirmed');

    const result = await claimCreatorFees(connection, keypair);

    if (result.success) {
      await ctx.reply(
        `*Creator fees claimed!*\n\n` +
        `Wallet: \`${defaultWallet.publicKey.slice(0, 8)}...\`\n` +
        `Tx: \`${result.txHash}\`\n\n` +
        `[View on Solscan](https://solscan.io/tx/${result.txHash})\n\n` +
        `_Check your wallet balance to see the claimed amount._`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(`Claim failed: ${result.error}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await ctx.reply(`Claim failed: ${msg}`);
  }
}
