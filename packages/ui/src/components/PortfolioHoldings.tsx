/**
 * PortfolioHoldings - Shows all token holdings across wallets
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Coins,
} from 'lucide-react';
import { useSecureWallet } from '@/hooks/useSecureWallet';
import { useNetwork } from '@/context/NetworkContext';
import { Connection, PublicKey } from '@solana/web3.js';

interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  usdValue?: number;
  priceChange24h?: number;
  wallet: string;
  walletName: string;
}

export function PortfolioHoldings() {
  const { rpcUrl, network } = useNetwork();
  const { wallets, isLocked } = useSecureWallet({ rpcUrl });

  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalValue, setTotalValue] = useState(0);

  const fetchHoldings = useCallback(async () => {
    if (isLocked || wallets.length === 0) return;

    setIsLoading(true);
    const allHoldings: TokenHolding[] = [];

    try {
      const connection = new Connection(rpcUrl, 'confirmed');

      for (const wallet of wallets) {
        try {
          // Get all token accounts for this wallet
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new PublicKey(wallet.address),
            { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
          );

          for (const account of tokenAccounts.value) {
            const info = account.account.data.parsed.info;
            const balance = info.tokenAmount.uiAmount;

            if (balance && balance > 0) {
              allHoldings.push({
                mint: info.mint,
                symbol: info.mint.slice(0, 4) + '...',
                name: 'Unknown Token',
                balance,
                decimals: info.tokenAmount.decimals,
                wallet: wallet.address,
                walletName: wallet.name || 'Wallet',
              });
            }
          }
        } catch (err) {
          console.error(`Error fetching tokens for ${wallet.address}:`, err);
        }
      }

      // Fetch token info from DexScreener for known tokens
      const uniqueMints = [...new Set(allHoldings.map(h => h.mint))];
      
      for (const mint of uniqueMints.slice(0, 10)) { // Limit to 10 to avoid rate limits
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
          const data = await res.json();
          
          if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            const priceUsd = parseFloat(pair.priceUsd) || 0;
            const priceChange = parseFloat(pair.priceChange?.h24) || 0;
            
            // Update all holdings with this mint
            allHoldings.forEach(h => {
              if (h.mint === mint) {
                h.symbol = pair.baseToken?.symbol || h.symbol;
                h.name = pair.baseToken?.name || h.name;
                h.usdValue = h.balance * priceUsd;
                h.priceChange24h = priceChange;
              }
            });
          }
        } catch {
          // Ignore DexScreener errors
        }
      }

      setHoldings(allHoldings);
      setTotalValue(allHoldings.reduce((sum, h) => sum + (h.usdValue || 0), 0));

    } catch (err) {
      console.error('Error fetching holdings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [wallets, isLocked, rpcUrl]);

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  // Group holdings by token
  const groupedHoldings = holdings.reduce((acc, h) => {
    if (!acc[h.mint]) {
      acc[h.mint] = {
        ...h,
        totalBalance: 0,
        totalUsdValue: 0,
        wallets: []
      };
    }
    acc[h.mint].totalBalance += h.balance;
    acc[h.mint].totalUsdValue += h.usdValue || 0;
    acc[h.mint].wallets.push({ name: h.walletName, balance: h.balance });
    return acc;
  }, {} as Record<string, TokenHolding & { totalBalance: number; totalUsdValue: number; wallets: { name: string; balance: number }[] }>);

  const sortedHoldings = Object.values(groupedHoldings).sort((a, b) => b.totalUsdValue - a.totalUsdValue);

  if (isLocked) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <Wallet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Unlock your wallet to view holdings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Coins className="w-5 h-5 text-yellow-400" />
          Token Holdings
        </h3>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500">Total Value</p>
            <p className="text-lg font-bold text-white">${totalValue.toFixed(2)}</p>
          </div>
          <button
            onClick={fetchHoldings}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Coins className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>{isLoading ? 'Loading holdings...' : 'No token holdings found'}</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {sortedHoldings.map((token) => (
            <div
              key={token.mint}
              className="bg-slate-800/50 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                    {token.symbol.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-white">{token.symbol}</p>
                    <p className="text-xs text-slate-500">{token.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-white">{token.totalBalance.toLocaleString()}</p>
                  {token.totalUsdValue > 0 && (
                    <p className="text-sm text-slate-400">${token.totalUsdValue.toFixed(2)}</p>
                  )}
                </div>
              </div>

              {token.priceChange24h !== undefined && (
                <div className="flex items-center gap-2 mb-2">
                  {token.priceChange24h >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                  <span className={`text-xs ${token.priceChange24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}% (24h)
                  </span>
                </div>
              )}

              {/* Wallet breakdown */}
              <div className="pt-2 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 mb-1">Held in {token.wallets.length} wallet(s):</p>
                <div className="flex flex-wrap gap-2">
                  {token.wallets.map((w, i) => (
                    <span key={i} className="text-xs bg-slate-900 px-2 py-1 rounded">
                      {w.name}: {w.balance.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>

              {/* View on Solscan */}
              <a
                href={`https://solscan.io/token/${token.mint}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-2"
              >
                View token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PortfolioHoldings;
