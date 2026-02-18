/**
 * Wallet Command - Wallet management utilities
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import chalk from 'chalk';
import ora from 'ora';
import { TrenchConfig, loadKeypair } from '../config.js';
import { generateWallets } from '@trenchtools/core/wallet';

interface WalletOptions {
  generate?: string;
  list?: boolean;
  balance?: boolean;
  fund?: string;
  collect?: boolean;
  config: TrenchConfig;
}

export async function walletCommand(options: WalletOptions): Promise<void> {
  const spinner = ora('Processing wallet command...').start();

  try {
    const connection = new Connection(options.config.rpc.mainnet, 'confirmed');

    // Generate wallets
    if (options.generate) {
      const count = parseInt(options.generate);
      if (isNaN(count) || count < 1) {
        spinner.fail(chalk.red('Invalid wallet count'));
        return;
      }

      spinner.text = `Generating ${count} wallet(s)...`;
      const wallets = generateWallets(count);

      spinner.succeed(chalk.green(`Generated ${count} wallet(s)`));
      console.log(chalk.cyan('\n🔑 New Wallets (save these keys securely!):'));
      
      for (let i = 0; i < wallets.length; i++) {
        const w = wallets[i];
        console.log(chalk.yellow(`\n--- Wallet ${i + 1} ---`));
        console.log(`Public Key: ${w.publicKey}`);
        console.log(`Private Key: ${w.privateKey}`);
      }

      console.log(chalk.red('\n⚠️  IMPORTANT: Save these private keys securely!'));
      console.log(chalk.red('   They will not be shown again.'));
      return;
    }

    // List wallets
    if (options.list || options.balance) {
      spinner.text = 'Loading wallets...';

      const wallets: { name: string; keypair: Keypair }[] = [];

      try {
        wallets.push({ name: 'Main', keypair: loadKeypair(options.config.wallets.main) });
      } catch (e) {
        spinner.warn(chalk.yellow('Could not load main wallet'));
      }

      if (options.config.wallets.snipe) {
        for (let i = 0; i < options.config.wallets.snipe.length; i++) {
          try {
            wallets.push({
              name: `Snipe ${i + 1}`,
              keypair: loadKeypair(options.config.wallets.snipe[i]),
            });
          } catch (e) {
            // Skip invalid wallets
          }
        }
      }

      if (wallets.length === 0) {
        spinner.fail(chalk.red('No wallets found in config'));
        return;
      }

      spinner.succeed(chalk.green(`Found ${wallets.length} wallet(s)`));

      if (options.balance) {
        console.log(chalk.cyan('\n💰 Wallet Balances:'));
        
        for (const w of wallets) {
          const balance = await connection.getBalance(w.keypair.publicKey);
          const solBalance = balance / LAMPORTS_PER_SOL;
          console.log(`   ${w.name}: ${w.keypair.publicKey.toString()}`);
          console.log(`           ${solBalance.toFixed(4)} SOL`);
        }
      } else {
        console.log(chalk.cyan('\n🔑 Wallets:'));
        for (const w of wallets) {
          console.log(`   ${w.name}: ${w.keypair.publicKey.toString()}`);
        }
      }
      return;
    }

    // Fund wallets
    if (options.fund) {
      const amount = parseFloat(options.fund);
      if (isNaN(amount) || amount <= 0) {
        spinner.fail(chalk.red('Invalid fund amount'));
        return;
      }

      spinner.text = 'Loading wallets...';

      const mainWallet = loadKeypair(options.config.wallets.main);
      const snipeWallets: Keypair[] = [];

      if (options.config.wallets.snipe) {
        for (const key of options.config.wallets.snipe) {
          try {
            snipeWallets.push(loadKeypair(key));
          } catch {
            // Skip invalid
          }
        }
      }

      if (snipeWallets.length === 0) {
        spinner.fail(chalk.red('No snipe wallets to fund'));
        return;
      }

      const lamportsPerWallet = Math.floor((amount * LAMPORTS_PER_SOL) / snipeWallets.length);

      spinner.text = `Funding ${snipeWallets.length} wallet(s) with ${amount} SOL total...`;

      const transaction = new Transaction();

      for (const wallet of snipeWallets) {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: mainWallet.publicKey,
            toPubkey: wallet.publicKey,
            lamports: lamportsPerWallet,
          })
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = mainWallet.publicKey;
      transaction.sign(mainWallet);

      const signature = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      spinner.succeed(chalk.green(`Funded ${snipeWallets.length} wallet(s)`));
      console.log(`   TX: https://solscan.io/tx/${signature}`);
      return;
    }

    // Collect SOL
    if (options.collect) {
      spinner.text = 'Loading wallets...';

      const mainWallet = loadKeypair(options.config.wallets.main);
      const snipeWallets: Keypair[] = [];

      if (options.config.wallets.snipe) {
        for (const key of options.config.wallets.snipe) {
          try {
            snipeWallets.push(loadKeypair(key));
          } catch {
            // Skip invalid
          }
        }
      }

      if (snipeWallets.length === 0) {
        spinner.fail(chalk.red('No snipe wallets to collect from'));
        return;
      }

      let totalCollected = 0;

      for (const wallet of snipeWallets) {
        const balance = await connection.getBalance(wallet.publicKey);
        const rentExempt = 890880; // Min for rent

        if (balance <= rentExempt) {
          continue;
        }

        const toSend = balance - 5000 - rentExempt; // Leave some for rent + fees
        if (toSend <= 0) continue;

        try {
          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: mainWallet.publicKey,
              lamports: toSend,
            })
          );

          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = wallet.publicKey;
          transaction.sign(wallet);

          await connection.sendRawTransaction(transaction.serialize());
          totalCollected += toSend;
        } catch (e) {
          // Skip failed transfers
        }
      }

      spinner.succeed(chalk.green(`Collected ${(totalCollected / LAMPORTS_PER_SOL).toFixed(4)} SOL`));
      return;
    }

    spinner.info('Use --help to see available wallet commands');

  } catch (error) {
    spinner.fail(chalk.red(`Wallet command failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
