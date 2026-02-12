#!/usr/bin/env node
/**
 * Test Jupiter Swap - Use the new authenticated API
 * Usage: node scripts/test-jupiter-swap.js <token_address> [amount_sol]
 */

const fs = require('fs');
const path = require('path');

// Load API key from .env manually (no dotenv dependency)
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const keyMatch = envContent.match(/JUPITER_API_KEY=(.+)/);
const JUPITER_API_KEY = keyMatch ? keyMatch[1].trim() : null;
const JUPITER_API_URL = 'https://api.jup.ag/swap/v1';
const WSOL = 'So11111111111111111111111111111111111111112';

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
    const text = await resp.text();
    throw new Error(`Jupiter API error: ${resp.status} - ${text}`);
  }

  return resp.json();
}

async function main() {
  const token = process.argv[2];
  const amountSol = parseFloat(process.argv[3]) || 0.01;
  
  if (!token) {
    console.log('Usage: node test-jupiter-swap.js <token_address> [amount_sol]');
    console.log('Example: node test-jupiter-swap.js JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN 0.01');
    process.exit(1);
  }

  if (!JUPITER_API_KEY) {
    console.error('❌ JUPITER_API_KEY not found in .env');
    process.exit(1);
  }

  console.log(`🔍 Getting quote: ${amountSol} SOL → ${token.slice(0,8)}...`);
  console.log('');

  try {
    const quote = await getQuote(token, amountSol * 1e9);
    
    console.log('✅ Quote received:');
    console.log(`├─ Input: ${amountSol} SOL`);
    console.log(`├─ Output: ${Number(quote.outAmount) / 1e6} tokens`);
    console.log(`├─ Price Impact: ${quote.priceImpactPct}%`);
    console.log(`├─ Route hops: ${quote.routePlan?.length || 1}`);
    
    if (quote.routePlan) {
      console.log('└─ Route:');
      quote.routePlan.forEach((hop, i) => {
        const info = hop.swapInfo;
        console.log(`   ${i+1}. ${info.label}: ${info.inputMint.slice(0,4)}... → ${info.outputMint.slice(0,4)}...`);
      });
    }
    
    console.log('\n📊 Raw quote saved to: /tmp/jupiter-quote.json');
    fs.writeFileSync('/tmp/jupiter-quote.json', JSON.stringify(quote, null, 2));
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
