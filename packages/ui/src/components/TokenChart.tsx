/**
 * TokenChart - Interactive charts with buy/sell markers
 * Uses lightweight-charts for custom charting with trade markers
 */

import { useState, useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  BarChart3,
  Users,
  Droplets,
  Activity,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { useNetwork } from '@/context/NetworkContext';
import { useTxHistory } from '@/context/TxHistoryContext';
import { useActiveTokens } from '@/context/ActiveTokensContext';

interface TokenData {
  symbol: string;
  name: string;
  price: string;
  priceUsd: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange5m: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  txns24h: { buys: number; sells: number };
  pairAddress: string;
  dexId: string;
}

interface OHLCVBar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function TokenChart() {
  const { network } = useNetwork();
  const { getTradesForToken, trades } = useTxHistory();
  const { tokens } = useActiveTokens();
  
  const [tokenMint, setTokenMint] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [ohlcData, setOhlcData] = useState<OHLCVBar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Fetch token data from DexScreener
  const fetchTokenData = async (mint: string) => {
    if (!mint) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await res.json();

      if (!data.pairs || data.pairs.length === 0) {
        setError('Token not found on any DEX');
        setTokenData(null);
        return;
      }

      const pair = data.pairs[0];
      
      setTokenData({
        symbol: pair.baseToken?.symbol || 'Unknown',
        name: pair.baseToken?.name || 'Unknown Token',
        price: pair.priceNative || '0',
        priceUsd: parseFloat(pair.priceUsd) || 0,
        priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
        priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
        priceChange5m: parseFloat(pair.priceChange?.m5) || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        marketCap: pair.fdv || 0,
        txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
        pairAddress: pair.pairAddress,
        dexId: pair.dexId,
      });

      setTokenMint(mint);
      
      // Fetch OHLCV data from Birdeye or generate mock for now
      await fetchOHLCData(pair.pairAddress);

    } catch (err) {
      setError('Failed to fetch token data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch OHLC data (using DexScreener pair data or mock)
  // pairAddress reserved for future Birdeye API integration
  const fetchOHLCData = async (_pairAddress: string) => {
    try {
      // DexScreener doesn't have a public OHLC API, so we'll generate synthetic data
      // based on current price and simulate historical movement
      // In production, you'd use Birdeye API or similar
      
      const now = Math.floor(Date.now() / 1000);
      const bars: OHLCVBar[] = [];
      const currentPrice = tokenData?.priceUsd || 0.001;
      
      // Generate 100 bars of 5-minute data
      for (let i = 99; i >= 0; i--) {
        const time = (now - (i * 300)) as UTCTimestamp; // 5 min intervals
        const volatility = 0.02; // 2% per candle
        const trend = Math.sin(i / 20) * 0.1; // Slight wave pattern
        
        const basePrice = currentPrice * (1 + trend);
        const open = basePrice * (1 + (Math.random() - 0.5) * volatility);
        const close = basePrice * (1 + (Math.random() - 0.5) * volatility);
        const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
        const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
        
        bars.push({ time, open, high, low, close });
      }
      
      setOhlcData(bars);
    } catch (err) {
      console.error('Failed to fetch OHLC:', err);
    }
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#475569', labelBackgroundColor: '#334155' },
        horzLine: { color: '#475569', labelBackgroundColor: '#334155' },
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#334155',
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update chart data when OHLC or trades change
  useEffect(() => {
    if (!candleSeriesRef.current || ohlcData.length === 0) return;

    candleSeriesRef.current.setData(ohlcData);
    
    // Add buy/sell markers
    if (tokenMint) {
      const tokenTrades = getTradesForToken(tokenMint);
      
      const markers = tokenTrades.map(trade => ({
        time: Math.floor(trade.timestamp / 1000) as UTCTimestamp,
        position: trade.type === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
        color: trade.type === 'buy' ? '#10b981' : '#ef4444',
        shape: trade.type === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        text: `${trade.type.toUpperCase()} ${trade.amount} SOL`,
        size: 2,
      }));
      
      candleSeriesRef.current.setMarkers(markers);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [ohlcData, tokenMint, trades, getTradesForToken]);

  const handleSearch = () => {
    if (searchInput.trim()) {
      fetchTokenData(searchInput.trim());
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const PriceChange = ({ value, label }: { value: number; label: string }) => (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-sm font-medium flex items-center justify-center gap-1 ${
        value >= 0 ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {value >= 0 ? '+' : ''}{value.toFixed(2)}%
      </p>
    </div>
  );

  // Get trades for current token
  const currentTokenTrades = tokenMint ? getTradesForToken(tokenMint) : [];
  const buyCount = currentTokenTrades.filter(t => t.type === 'buy').length;
  const sellCount = currentTokenTrades.filter(t => t.type === 'sell').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Token Charts</h2>
        <p className="text-slate-400 mt-1">View price charts with your buy/sell markers</p>
      </div>

      {/* Search Bar */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Enter token mint address..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading || !searchInput.trim()}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 rounded-lg font-medium flex items-center gap-2"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            Load Chart
          </button>
        </div>

        {/* Active tokens quick select */}
        {tokens.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-slate-500">Active tokens:</span>
            {tokens.map(token => (
              <button
                key={token.mint}
                onClick={() => { setSearchInput(token.mint); fetchTokenData(token.mint); }}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                  token.source === 'volume' ? 'bg-purple-500/20 text-purple-400' :
                  token.source === 'snipe' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  token.source === 'volume' ? 'bg-purple-400' :
                  token.source === 'snipe' ? 'bg-orange-400' : 'bg-blue-400'
                }`} />
                {token.symbol || token.mint.slice(0, 8)}
              </button>
            ))}
          </div>
        )}

        {/* Quick tokens */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-slate-500">Popular:</span>
          {[
            { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
            { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
            { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
          ].map(token => (
            <button
              key={token.symbol}
              onClick={() => { setSearchInput(token.mint); fetchTokenData(token.mint); }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
            >
              {token.symbol}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {tokenData && (
        <>
          {/* Token Info Header */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xl font-bold">
                  {tokenData.symbol.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    {tokenData.symbol}
                    <span className="text-sm font-normal text-slate-500">/ SOL</span>
                  </h3>
                  <p className="text-slate-400">{tokenData.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-white">${tokenData.priceUsd.toFixed(tokenData.priceUsd < 0.01 ? 8 : 4)}</p>
                <p className="text-sm text-slate-400">{tokenData.price} SOL</p>
              </div>
            </div>

            {/* Price Changes */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-800/50 rounded-lg mb-4">
              <PriceChange value={tokenData.priceChange5m} label="5m" />
              <PriceChange value={tokenData.priceChange1h} label="1h" />
              <PriceChange value={tokenData.priceChange24h} label="24h" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs">24h Volume</span>
                </div>
                <p className="text-lg font-bold text-white">{formatNumber(tokenData.volume24h)}</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Droplets className="w-4 h-4" />
                  <span className="text-xs">Liquidity</span>
                </div>
                <p className="text-lg font-bold text-white">{formatNumber(tokenData.liquidity)}</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-xs">Market Cap</span>
                </div>
                <p className="text-lg font-bold text-white">{formatNumber(tokenData.marketCap)}</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-2 text-slate-400 mb-1">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">24h Txns</span>
                </div>
                <p className="text-lg font-bold text-white">
                  <span className="text-emerald-400">{tokenData.txns24h.buys}</span>
                  {' / '}
                  <span className="text-red-400">{tokenData.txns24h.sells}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Your Trade Activity */}
          {currentTokenTrades.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" />
                Your Trade Activity
              </h3>
              <div className="flex gap-6 mb-4">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">{buyCount}</span>
                  <span className="text-slate-400">Buys</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="w-5 h-5 text-red-400" />
                  <span className="text-red-400 font-bold">{sellCount}</span>
                  <span className="text-slate-400">Sells</span>
                </div>
              </div>
              <p className="text-sm text-slate-500">
                Your trades are marked on the chart below with arrows
              </p>
            </div>
          )}

          {/* DexScreener Live Chart */}
          <div className="card p-0 overflow-hidden">
            <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-white">Live Price Chart</span>
              <a
                href={`https://dexscreener.com/solana/${tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
              >
                Open in DexScreener <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <iframe
              src={`https://dexscreener.com/solana/${tokenMint}?embed=1&theme=dark&trades=0&info=0`}
              className="w-full h-[400px] border-0"
              title="DexScreener Chart"
            />
          </div>

          {/* Chart with Your Trade Markers */}
          {currentTokenTrades.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-white">Your Trades Overlay</span>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <ArrowUpCircle className="w-3 h-3 text-emerald-400" />
                      <span className="text-slate-400">Buy</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowDownCircle className="w-3 h-3 text-red-400" />
                      <span className="text-slate-400">Sell</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => fetchOHLCData(tokenData.pairAddress)}
                  className="p-1.5 hover:bg-slate-700 rounded"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              
              <div ref={chartContainerRef} className="w-full" />
            </div>
          )}

          {/* Recent Your Trades Table */}
          {currentTokenTrades.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-4">Your Recent Trades</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700">
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Wallet</th>
                      <th className="pb-2 font-medium">TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {currentTokenTrades.slice(0, 10).map((trade) => (
                      <tr key={trade.id} className="hover:bg-slate-800/30">
                        <td className="py-2 text-slate-400">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 w-fit ${
                            trade.type === 'buy' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.type === 'buy' ? (
                              <ArrowUpCircle className="w-3 h-3" />
                            ) : (
                              <ArrowDownCircle className="w-3 h-3" />
                            )}
                            {trade.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 text-white font-medium">{trade.amount} SOL</td>
                        <td className="py-2 text-slate-400 font-mono text-xs">{trade.wallet}</td>
                        <td className="py-2">
                          {trade.txHash && !trade.txHash.startsWith('sim-') ? (
                            <a
                              href={`https://solscan.io/tx/${trade.txHash}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500">sim</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* External Links */}
          <div className="flex gap-2">
            <a
              href={`https://dexscreener.com/solana/${tokenMint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-center text-sm flex items-center justify-center gap-2"
            >
              DexScreener <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`https://www.geckoterminal.com/solana/pools/${tokenData.pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-center text-sm flex items-center justify-center gap-2"
            >
              GeckoTerminal <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`https://solscan.io/token/${tokenMint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-center text-sm flex items-center justify-center gap-2"
            >
              Solscan <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </>
      )}

      {!tokenData && !error && !isLoading && (
        <div className="card text-center py-12">
          <BarChart3 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">Enter a token address to view charts</p>
          <p className="text-slate-500 text-sm mt-2">
            Buy/sell markers will appear for tokens you're actively trading
          </p>
        </div>
      )}
    </div>
  );
}

export default TokenChart;
