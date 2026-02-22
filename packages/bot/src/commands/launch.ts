import { Context } from 'grammy';
import { Connection } from '@solana/web3.js';
import { ensureUnlocked, getDefaultWallet, getKeypairByAddress } from '../lib/vault.js';
import { downloadTelegramFile, launchToken } from '../lib/launch.js';
import { stateManager } from '../state/index.js';

export interface LaunchWizard {
  step: 'name' | 'symbol' | 'description' | 'image' | 'initial_buy' | 'confirm';
  name?: string;
  symbol?: string;
  description?: string;
  imageFileId?: string;
  initialBuySol?: number;
}

// In-memory wizard state per chat
export const activeWizards = new Map<number, LaunchWizard>();

export async function launchCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  activeWizards.set(chatId, { step: 'name' });
  await ctx.reply(
    `*Let's launch a token!*\n\nSend me the *token name* (e.g. My Cool Token):\n\n_Send /cancel to abort_`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleLaunchMessage(ctx: Context, botToken: string): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId || !activeWizards.has(chatId)) return false;

  const wizard = activeWizards.get(chatId)!;
  const text = ctx.message?.text?.trim() || '';

  // Handle cancel at any step
  if (text.toLowerCase() === '/cancel') {
    activeWizards.delete(chatId);
    await ctx.reply('Launch cancelled.');
    return true;
  }

  switch (wizard.step) {
    case 'name': {
      if (!text || text.length < 1 || text.length > 32) {
        await ctx.reply('Token name must be 1-32 characters. Try again:');
        return true;
      }
      wizard.name = text;
      wizard.step = 'symbol';
      await ctx.reply(
        `Token name set to *${wizard.name}*\n\nNow send the *ticker symbol* (e.g. MCT):`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'symbol': {
      if (!text || text.length < 1 || text.length > 10 || !/^[A-Za-z]+$/.test(text)) {
        await ctx.reply('Symbol must be 1-10 letters only (no numbers or special chars). Try again:');
        return true;
      }
      wizard.symbol = text.toUpperCase();
      wizard.step = 'description';
      await ctx.reply(
        `Symbol: *${wizard.symbol}*\n\nNow send a *description*:`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'description': {
      if (!text || text.length < 1 || text.length > 500) {
        await ctx.reply('Description must be 1-500 characters. Try again:');
        return true;
      }
      wizard.description = text;
      wizard.step = 'image';
      await ctx.reply(
        `Now send me the *token image* (as a photo):`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'image': {
      const photos = ctx.message?.photo;
      if (!photos || photos.length === 0) {
        await ctx.reply('Please send a photo, not text.');
        return true;
      }
      // Get largest photo (last element in array)
      const largestPhoto = photos[photos.length - 1];
      wizard.imageFileId = largestPhoto.file_id;
      wizard.step = 'initial_buy';
      await ctx.reply(
        `Image received!\n\n*Initial buy amount in SOL?* (send \`0\` for no dev buy):`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'initial_buy': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 0 || amount > 85) {
        await ctx.reply('Amount must be a number between 0 and 85 SOL. Try again:');
        return true;
      }
      wizard.initialBuySol = amount;
      wizard.step = 'confirm';
      await ctx.reply(
        `*Launch Summary*\n\n` +
        `Name: ${wizard.name}\n` +
        `Symbol: ${wizard.symbol}\n` +
        `Description: ${wizard.description}\n` +
        `Image: Uploaded\n` +
        `Initial Buy: ${wizard.initialBuySol} SOL\n\n` +
        `Reply *YES* to launch or *CANCEL* to abort.`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    case 'confirm': {
      const answer = text.toUpperCase();
      if (answer === 'CANCEL') {
        activeWizards.delete(chatId);
        await ctx.reply('Launch cancelled.');
        return true;
      }
      if (answer !== 'YES') {
        await ctx.reply('Reply *YES* to launch or *CANCEL* to abort.', { parse_mode: 'Markdown' });
        return true;
      }

      // Execute launch
      await ctx.reply('Launching token... this may take 30-60 seconds');

      try {
        const vaultPassword = process.env.TRENCH_VAULT_PASSWORD;
        if (!vaultPassword) {
          activeWizards.delete(chatId);
          await ctx.reply('TRENCH_VAULT_PASSWORD not set. Configure vault access first.');
          return true;
        }

        const rpcUrl = process.env.SOLANA_RPC_URL;
        if (!rpcUrl) {
          activeWizards.delete(chatId);
          await ctx.reply('SOLANA_RPC_URL not set.');
          return true;
        }

        const vaultPath = process.env.TRENCH_VAULT_PATH;
        const wallets = await ensureUnlocked(vaultPassword, vaultPath);
        const defaultWallet = getDefaultWallet(wallets);
        const keypair = getKeypairByAddress(wallets, defaultWallet.publicKey);

        // Download image from Telegram
        const imageBuffer = await downloadTelegramFile(ctx.api, wizard.imageFileId!, botToken);

        const connection = new Connection(rpcUrl, 'confirmed');
        const result = await launchToken(connection, {
          creatorKeypair: keypair,
          metadata: {
            name: wizard.name!,
            symbol: wizard.symbol!,
            description: wizard.description!,
          },
          imageBuffer,
          imageFilename: 'token-image.png',
          initialBuySol: wizard.initialBuySol,
        });

        activeWizards.delete(chatId);

        if (result.success) {
          // Record launch in state
          stateManager.addLaunch({
            mintAddress: result.mintAddress!,
            name: wizard.name!,
            symbol: wizard.symbol!,
            txHash: result.txHash!,
            timestamp: Date.now(),
          });

          await ctx.reply(
            `*Token Launched!*\n\n` +
            `Name: ${wizard.name}\n` +
            `Symbol: $${wizard.symbol}\n` +
            `Mint: \`${result.mintAddress}\`\n` +
            `Tx: \`${result.txHash}\`\n\n` +
            `[View on PumpFun](https://pump.fun/${result.mintAddress})\n` +
            `[View on Solscan](https://solscan.io/tx/${result.txHash})`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await ctx.reply(`Launch failed: ${result.error}`);
        }
      } catch (error) {
        activeWizards.delete(chatId);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        await ctx.reply(`Launch failed: ${msg}`);
      }

      return true;
    }

    default:
      return false;
  }
}
