/**
 * Exit Command - Sell token positions
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import chalk from 'chalk';
import ora from 'ora';
import { TrenchConfig, loadKeypair } from '../config.js';

interface ExitOptions {
  percent: string;
  wallets: string;
  jito: boolean;
  config: TrenchConfig;
}

export async function exitCommand(
  mint: string,
  options: ExitOptions
): Promise<void> {
  const spinner = ora('Initializing exit...').start();

  try {
    // Validate mint address
    let tokenMint: PublicKey;
    try {
      tokenMint = new PublicKey(mint);
    } catch {
      spinner.fail(chalk.red('Invalid token mint address'));
      return;
    }

    // Parse options
    const sellPercent = parseInt(options.percent);
    if (isNaN(sellPercent) || sellPercent < 1 || sellPercent > 100) {
      spinner.fail(chalk.red('Invalid sell percentage (1-100)'));
      return;
    }

    // Connect to RPC
    const rpcUrl = options.config.rpc.mainnet;
    const connection = new Connection(rpcUrl, 'confirmed');

    spinner.text = 'Loading wallets...';

    // Load wallets
    const mainWallet = loadKeypair(options.config.wallets.main);
    const wallets = [mainWallet];

    if (options.config.wallets.snipe) {
      for (const walletKey of options.config.wallets.snipe) {
        wallets.push(loadKeypair(walletKey));
      }
    }

    // Filter wallets if specific indices requested
    let walletsToUse = wallets;
    if (options.wallets !== 'all') {
      const indices = options.wallets.split(',').map(i => parseInt(i.trim()));
      walletsToUse = indices.map(i => wallets[i]).filter(Boolean);
    }

    spinner.text = `Using ${walletsToUse.length} wallet(s)`;

    // Check if token is on PumpFun or Raydium
    spinner.text = 'Checking token status...';

    const { PumpFunClient } = await import('@trenchtools/core/snipe');
    const client = new PumpFunClient(connection);
    
    const isOnPumpFun = await client.isOnPumpFun(tokenMint);
    const hasMigrated = await client.hasMigrated(tokenMint);

    if (!isOnPumpFun && !hasMigrated) {
      spinner.fail(chalk.red('Token not found on PumpFun'));
      return;
    }

    if (hasMigrated) {
      spinner.warn(chalk.yellow('Token has migrated to Raydium - DEX sell not yet implemented'));
      return;
    }

    spinner.succeed(chalk.green('Token is on PumpFun bonding curve'));

    // Get token balances for each wallet
    const balances: { wallet: typeof wallets[0]; balance: bigint; ata: PublicKey }[] = [];

    for (const wallet of walletsToUse) {
      const ata = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);
      try {
        const account = await getAccount(connection, ata);
        if (account.amount > 0n) {
          balances.push({ wallet, balance: account.amount, ata });
        }
      } catch {
        // No token account or empty
      }
    }

    if (balances.length === 0) {
      spinner.fail(chalk.red('No token balances found in any wallet'));
      return;
    }

    // Display balances
    console.log(chalk.cyan(`\n💰 Token Balances:`));
    for (const b of balances) {
      const addr = b.wallet.publicKey.toString().slice(0, 8) + '...';
      console.log(`   ${addr}: ${Number(b.balance) / 1e6} tokens`);
    }

    // Calculate amounts to sell
    const totalToSell = balances.reduce((sum, b) => {
      return sum + (b.balance * BigInt(sellPercent) / 100n);
    }, 0n);

    console.log(chalk.cyan(`\n📊 Selling ${sellPercent}% = ${Number(totalToSell) / 1e6} tokens`));

    // Get quote for total sell
    const quote = await client.getQuote(tokenMint, totalToSell, false, 100);
    console.log(`   Expected SOL: ${Number(quote.outAmount) / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Min SOL: ${Number(quote.minOutAmount) / LAMPORTS_PER_SOL} SOL`);

    // Execute sells
    const results: { wallet: string; signature?: string; error?: string }[] = [];

    for (const b of balances) {
      const walletAddr = b.wallet.publicKey.toString().slice(0, 8) + '...';
      const sellAmount = b.balance * BigInt(sellPercent) / 100n;

      if (sellAmount === 0n) continue;

      spinner.start(`Selling for ${walletAddr}...`);

      try {
        const result = await client.sell(
          b.wallet,
          tokenMint,
          sellAmount,
          100 // 1% slippage
        );

        results.push({ wallet: walletAddr, signature: result.signature });
        spinner.succeed(chalk.green(`Sell successful for ${walletAddr}`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ wallet: walletAddr, error: errorMsg });
        spinner.fail(chalk.red(`Sell failed for ${walletAddr}: ${errorMsg}`));
      }
    }

    // Summary
    console.log(chalk.cyan(`\n📋 Summary:`));
    const successful = results.filter(r => r.signature);
    const failed = results.filter(r => r.error);
    console.log(`   Successful: ${successful.length}/${results.length}`);
    console.log(`   Failed: ${failed.length}/${results.length}`);

    if (successful.length > 0) {
      console.log(chalk.cyan(`\n✅ Transactions:`));
      for (const r of successful) {
        console.log(`   ${r.wallet}: https://solscan.io/tx/${r.signature}`);
      }
    }

  } catch (error) {
    spinner.fail(chalk.red(`Exit failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
