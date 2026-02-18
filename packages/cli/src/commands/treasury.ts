/**
 * Treasury CLI Commands
 * Main wallet funding and sniper wallet management
 */
import { Command } from 'commander';
import {
  getTreasuryStatus,
  distributeFunds,
  autoFund,
  formatTreasuryStatus,
  formatDistributionResult,
  getTreasuryQR,
  getFundingHistory,
  recordExternalFunding,
} from '@trenchtools/core';

export const treasuryCommand = new Command('treasury')
  .description('Main wallet treasury management')
  .option('--status', 'Check treasury status')
  .option('--fund', 'Distribute funds from main to sniper wallets')
  .option('--auto', 'Auto-fund all wallets that need SOL')
  .option('--qr [amount]', 'Generate QR code for funding (optional: amount in SOL)')
  .option('--history', 'Show funding history')
  .option('--record <amount>', 'Record external funding (e.g., someone sent you SOL)')
  .action(async (options) => {
    const connection = getConnection();
    const config = getTreasuryConfigFromEnv();
    const mainWallet = getMainWallet();

    try {
      if (options.status) {
        console.log('📊 Checking treasury...');
        const status = await getTreasuryStatus(connection, config);
        console.log(formatTreasuryStatus(status));
      }

      if (options.fund || options.auto) {
        console.log('💰 Distributing funds...');
        const result = await autoFund(
          connection,
          config,
          mainWallet,
          (msg) => console.log(msg)
        );
        console.log(formatDistributionResult(result));
      }

      if (options.qr !== undefined) {
        const qr = getTreasuryQR(config.mainWallet, options.qr ? parseFloat(options.qr) : undefined);
        console.log('📱 Scan this QR code to fund treasury:');
        console.log(qr);
        console.log(`\nOr send SOL to: ${config.mainWallet}`);
      }

      if (options.history) {
        const history = getFundingHistory(10);
        console.log('💸 Recent Funding:\n');
        history.forEach(h => {
          const type = h.from === 'external' ? '📥 External' : '📤 Internal';
          console.log(`${type}: ${h.amount.toFixed(4)} SOL (${new Date(h.timestamp).toLocaleString()})`);
        });
      }

      if (options.record) {
        const amount = parseFloat(options.record);
        recordExternalFunding(amount);
        console.log(`✅ Recorded ${amount} SOL external funding`);
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  });

// Helper functions
function getConnection() {
  const { Connection } = require('@solana/web3.js');
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpc, 'confirmed');
}

function getTreasuryConfigFromEnv() {
  const mainWallet = process.env.MAIN_WALLET || process.env.WALLET_MNEMONIC;
  if (!mainWallet) {
    throw new Error('Set MAIN_WALLET or WALLET_MNEMONIC in .env.local');
  }

  // Generate sniper wallets from mnemonic
  const { generateWallets } = require('@trenchtools/core');
  const count = parseInt(process.env.WALLET_COUNT || '5');
  const wallets = generateWallets(mainWallet, count);

  return {
    mainWallet: wallets[0].address, // First wallet is main
    sniperWallets: wallets.slice(1).map(w => w.address), // Rest are snipers
    targetBalance: parseFloat(process.env.TARGET_BALANCE || '0.05'),
    minTreasuryBalance: parseFloat(process.env.MIN_TREASURY_BALANCE || '0.1'),
  };
}

function getMainWallet() {
  // Load keypair from mnemonic
  const { generateWallets } = require('@trenchtools/core');
  const mnemonic = process.env.WALLET_MNEMONIC || process.env.MAIN_WALLET;
  if (!mnemonic) throw new Error('Set WALLET_MNEMONIC');
  return generateWallets(mnemonic, 1)[0].keypair;
}
