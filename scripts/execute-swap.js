#!/usr/bin/env node
/**
 * Execute Jupiter Swap - Real mainnet swap
 * Usage: node scripts/execute-swap.js <token_address> [amount_sol]
 */

const fs = require('fs');
const path = require('path');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');

// Load API key from .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const keyMatch = envContent.match(/JUPITER_API_KEY=(.+)/);
const JUPITER_API_KEY = keyMatch ? keyMatch[1].trim() : null;

const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';
const WSOL = 'So11111111111111111111111111111111111111112';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

async function getQuote(outputMint, amountLamports) {
  const url = `${JUPITER_API_URL}/quote?` + new URLSearchParams({
    inputMint: WSOL,
    outputMint,
    amount: String(amountLamports),
    slippageBps: '100'
  });

  const resp = await fetch(url, {
    headers: { 'x-api-key': JUPITER_API_KEY }
  });

  if (!resp.ok) {
    throw new Error(`Quote error: ${resp.status} - ${await resp.text()}`);
  }

  return resp.json();
}

async function getSwapTransaction(quote, userPublicKey) {
  const resp = await fetch(`${JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': JUPITER_API_KEY
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'
    })
  });

  if (!resp.ok) {
    throw new Error(`Swap error: ${resp.status} - ${await resp.text()}`);
  }

  return resp.json();
}

async function main() {
  const token = process.argv[2];
  const amountSol = parseFloat(process.argv[3]) || 0.01;
  
  if (!token) {
    console.log('Usage: node execute-swap.js <token_address> [amount_sol]');
    process.exit(1);
  }

  if (!JUPITER_API_KEY) {
    console.error('❌ JUPITER_API_KEY not found in .env');
    process.exit(1);
  }

  // Load wallet
  const walletPath = path.join(__dirname, '..', 'mainnet-wallet.json');
  if (!fs.existsSync(walletPath)) {
    console.error('❌ mainnet-wallet.json not found');
    process.exit(1);
  }
  
  const keypairData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log('🔑 Wallet:', wallet.publicKey.toBase58());
  
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('💰 Balance:', balance / 1e9, 'SOL');
  console.log('');

  // Get quote
  console.log(`📊 Getting quote: ${amountSol} SOL → ${token.slice(0,8)}...`);
  const quote = await getQuote(token, amountSol * 1e9);
  
  const outputAmount = Number(quote.outAmount);
  console.log(`✅ Quote: ${outputAmount / 1e6} tokens (${quote.priceImpactPct}% impact)`);
  console.log('');

  // Get swap transaction
  console.log('📝 Building swap transaction...');
  const swapResult = await getSwapTransaction(quote, wallet.publicKey.toBase58());
  
  // Deserialize and sign
  const swapTxBuf = Buffer.from(swapResult.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(swapTxBuf);
  
  tx.sign([wallet]);
  
  // Send transaction
  console.log('🚀 Sending transaction...');
  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3
  });
  
  console.log('');
  console.log('✅ Transaction sent!');
  console.log('📜 Signature:', signature);
  console.log('🔗 Explorer: https://solscan.io/tx/' + signature);
  
  // Wait for confirmation
  console.log('');
  console.log('⏳ Waiting for confirmation...');
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  
  if (confirmation.value.err) {
    console.error('❌ Transaction failed:', confirmation.value.err);
  } else {
    console.log('✅ Confirmed!');
    
    // Log final balance
    const newBalance = await connection.getBalance(wallet.publicKey);
    console.log('💰 New SOL balance:', newBalance / 1e9, 'SOL');
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
