/**
 * Snipe Command - Buy tokens on PumpFun
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';
import { TrenchConfig, loadKeypair } from '../config.js';

interface SnipeOptions {
  amount: string;
  slippage: string;
  wallets: string;
  jito: boolean;
  tip: string;
  config: TrenchConfig;
}

export async function snipeCommand(
  mint: string,
  options: SnipeOptions
): Promise<void> {
  const spinner = ora('Initializing snipe...').start();

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
    const solAmount = parseFloat(options.amount);
    const slippageBps = parseInt(options.slippage);
    const walletCount = parseInt(options.wallets);

    if (isNaN(solAmount) || solAmount <= 0) {
      spinner.fail(chalk.red('Invalid SOL amount'));
      return;
    }

    // Connect to RPC
    const rpcUrl = options.config.rpc.mainnet;
    const connection = new Connection(rpcUrl, 'confirmed');

    spinner.text = 'Loading wallets...';

    // Load main wallet
    const mainWallet = loadKeypair(options.config.wallets.main);
    const wallets = [mainWallet];

    // Load additional wallets if requested
    if (walletCount > 1 && options.config.wallets.snipe) {
      for (let i = 0; i < Math.min(walletCount - 1, options.config.wallets.snipe.length); i++) {
        wallets.push(loadKeypair(options.config.wallets.snipe[i]));
      }
    }

    spinner.text = `Using ${wallets.length} wallet(s)`;

    // Check if token is on PumpFun
    spinner.text = 'Checking token status...';

    // Dynamic import to handle ESM
    const { PumpFunClient, TokenNotFoundError, TokenMigratedError } = await import('@trenchtools/core/snipe');

    const client = new PumpFunClient(connection);
    const tokenInfo = await client.getTokenInfo(tokenMint);

    if (!tokenInfo) {
      spinner.fail(chalk.red('Token not found on PumpFun bonding curve'));
      return;
    }

    if (tokenInfo.isComplete) {
      spinner.fail(chalk.red('Token has migrated to Raydium - use DEX instead'));
      return;
    }

    // Display token info
    spinner.succeed(chalk.green('Token found on PumpFun'));
    console.log(chalk.cyan(`\n📊 Token Info:`));
    console.log(`   Mint: ${tokenMint.toString()}`);
    console.log(`   Price: ${tokenInfo.currentPrice.toFixed(12)} SOL`);
    console.log(`   Market Cap: ${tokenInfo.marketCapSol.toFixed(2)} SOL`);

    // Get quote
    spinner.start('Getting quote...');
    const amountLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const quote = await client.getQuote(tokenMint, amountLamports, true, slippageBps);

    const tokensOut = BigInt(quote.outAmount);
    const minTokensOut = BigInt(quote.minOutAmount);

    spinner.succeed(chalk.green('Quote received'));
    console.log(chalk.cyan(`\n💰 Quote:`));
    console.log(`   Input: ${solAmount} SOL`);
    console.log(`   Output: ${Number(tokensOut) / 1e6} tokens`);
    console.log(`   Min Output: ${Number(minTokensOut) / 1e6} tokens`);
    console.log(`   Price Impact: ${quote.priceImpactPct.toFixed(2)}%`);

    // Execute buys
    if (options.jito) {
      spinner.start('Building Jito bundle...');
      // TODO: Implement Jito bundle execution
      spinner.warn(chalk.yellow('Jito bundles not yet implemented - using regular tx'));
    }

    const results: { wallet: string; signature?: string; error?: string }[] = [];

    for (const wallet of wallets) {
      const walletAddr = wallet.publicKey.toString().slice(0, 8) + '...';
      spinner.start(`Executing buy for ${walletAddr}...`);

      try {
        const result = await client.buy(
          wallet,
          tokenMint,
          amountLamports / BigInt(wallets.length),
          slippageBps
        );

        results.push({ wallet: walletAddr, signature: result.signature });
        spinner.succeed(chalk.green(`Buy successful for ${walletAddr}`));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ wallet: walletAddr, error: errorMsg });
        spinner.fail(chalk.red(`Buy failed for ${walletAddr}: ${errorMsg}`));
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
    spinner.fail(chalk.red(`Snipe failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
