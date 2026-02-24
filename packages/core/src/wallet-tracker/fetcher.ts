/**
 * Wallet data fetcher — holdings & trades via Helius DAS API with RPC fallback.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { WalletHolding, WalletTrade } from './types.js';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// ── Holdings ──

export async function fetchHoldings(
  connection: Connection,
  address: string,
  heliusApiKey?: string,
): Promise<WalletHolding[]> {
  if (heliusApiKey) {
    return fetchHoldingsHelius(address, heliusApiKey);
  }
  return fetchHoldingsRpc(connection, address);
}

async function fetchHoldingsHelius(address: string, apiKey: string): Promise<WalletHolding[]> {
  const url = `https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Helius balances failed: ${resp.status}`);
  const data = await resp.json();

  const holdings: WalletHolding[] = [];

  if (data.tokens && Array.isArray(data.tokens)) {
    for (const t of data.tokens) {
      if (t.amount === 0) continue;
      holdings.push({
        mint: t.mint,
        symbol: t.symbol || 'Unknown',
        name: t.name || t.symbol || 'Unknown Token',
        balance: t.amount / Math.pow(10, t.decimals || 0),
        decimals: t.decimals || 0,
        usdValue: t.price ? (t.amount / Math.pow(10, t.decimals || 0)) * t.price : undefined,
        imageUrl: t.logoURI || undefined,
      });
    }
  }

  return holdings;
}

async function fetchHoldingsRpc(connection: Connection, address: string): Promise<WalletHolding[]> {
  const pubkey = new PublicKey(address);
  const tokenAccounts = await connection.getTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const holdings: WalletHolding[] = [];

  for (const { account } of tokenAccounts.value) {
    const data = account.data;
    // SPL Token Account layout: mint (32) + owner (32) + amount (8)
    const mint = new PublicKey(data.slice(0, 32)).toBase58();
    const amountBuf = data.slice(64, 72);
    const amount = Number(amountBuf.readBigUInt64LE(0));

    if (amount === 0 || mint === WSOL_MINT) continue;

    holdings.push({
      mint,
      symbol: 'Unknown',
      name: 'Unknown Token',
      balance: amount / 1e6, // default 6 decimals, best effort
      decimals: 6,
    });
  }

  return holdings;
}

// ── Trades ──

export async function fetchTrades(
  address: string,
  heliusApiKey?: string,
  limit: number = 50,
): Promise<WalletTrade[]> {
  if (heliusApiKey) {
    return fetchTradesHelius(address, heliusApiKey, limit);
  }
  return [];
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
    tokenStandard?: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  description?: string;
}

async function fetchTradesHelius(
  address: string,
  apiKey: string,
  limit: number,
): Promise<WalletTrade[]> {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&type=SWAP&limit=${Math.min(limit, 100)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Helius transactions failed: ${resp.status}`);
  const txs: HeliusTx[] = await resp.json();

  const trades: WalletTrade[] = [];

  for (const tx of txs) {
    if (!tx.tokenTransfers?.length || !tx.nativeTransfers?.length) continue;

    // Determine if buy or sell based on SOL flow direction
    const solOut = tx.nativeTransfers
      .filter(t => t.fromUserAccount === address)
      .reduce((sum, t) => sum + t.amount, 0);
    const solIn = tx.nativeTransfers
      .filter(t => t.toUserAccount === address)
      .reduce((sum, t) => sum + t.amount, 0);

    const isBuy = solOut > solIn;
    const solAmount = Math.abs(solOut - solIn) / 1e9; // lamports to SOL

    // Find the non-SOL token transfer
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint !== WSOL_MINT);
    if (!tokenTransfer) continue;

    const tokenAmount = tokenTransfer.tokenAmount;
    if (tokenAmount === 0 || solAmount < 0.0001) continue;

    trades.push({
      signature: tx.signature,
      timestamp: tx.timestamp * 1000,
      type: isBuy ? 'buy' : 'sell',
      tokenMint: tokenTransfer.mint,
      tokenSymbol: 'Unknown',
      tokenAmount,
      solAmount,
      pricePerToken: solAmount / tokenAmount,
      source: tx.source || 'Unknown',
    });
  }

  return trades;
}

// ── Format helpers ──

export function formatHoldingsReport(holdings: WalletHolding[]): string {
  if (holdings.length === 0) return 'No token holdings found.';

  const sorted = [...holdings].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  const lines = sorted.map((h, i) => {
    const usd = h.usdValue ? ` ($${h.usdValue.toFixed(2)})` : '';
    return `${i + 1}. ${h.name} (${h.symbol})\n   Mint: ${h.mint}\n   Balance: ${h.balance.toLocaleString()}${usd}`;
  });

  return `Holdings (${holdings.length} tokens):\n\n${lines.join('\n\n')}`;
}

export function formatTradesReport(trades: WalletTrade[]): string {
  if (trades.length === 0) return 'No recent trades found.';

  const lines = trades.map((t, i) => {
    const time = new Date(t.timestamp).toLocaleString();
    const emoji = t.type === 'buy' ? 'BUY' : 'SELL';
    return `${i + 1}. [${emoji}] ${t.tokenSymbol}\n   ${t.tokenAmount.toLocaleString()} tokens for ${t.solAmount.toFixed(4)} SOL\n   Source: ${t.source} | ${time}\n   Tx: ${t.signature}`;
  });

  return `Recent trades (${trades.length}):\n\n${lines.join('\n\n')}`;
}
