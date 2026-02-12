import { useState, useEffect } from 'react'
import { 
  Search, 
  Shield, 
  Eye,
  RefreshCw,
  TrendingUp,
  X,
  Plus,
  ExternalLink,
  BarChart3
} from 'lucide-react'
import { useActiveTokens, ActiveToken } from '@/context/ActiveTokensContext'

// Types for Detection integration
interface AnalysisReport {
  tokenMint: string
  symbol?: string
  name?: string
  analyzedAt: number
  transactionCount: number
  timeRange: { start: number; end: number }
  patterns: Pattern[]
  overallConfidence: number
  manipulationScore: number
  recommendation: string
  citation: string
  priceUsd?: string
  priceChange24h?: string
  volume24h?: number
  liquidity?: number
  pairAddress?: string
}

interface Pattern {
  type: string
  confidence: number
  severity: 'low' | 'medium' | 'high'
  evidence: Evidence[]
  detectedAt: number
}

interface Evidence {
  type: string
  description: string
  data: Record<string, unknown>
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-red-400'
  if (score >= 50) return 'text-yellow-400'
  if (score >= 30) return 'text-blue-400'
  return 'text-emerald-400'
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'bg-red-500/20'
  if (score >= 50) return 'bg-yellow-500/20'
  if (score >= 30) return 'bg-blue-500/20'
  return 'bg-emerald-500/20'
}

function getSeverityColor(severity: Pattern['severity']): string {
  switch (severity) {
    case 'high': return 'text-red-400'
    case 'medium': return 'text-yellow-400'
    case 'low': return 'text-blue-400'
  }
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  const patternLabels: Record<string, string> = {
    'wallet_clustering': 'Wallet Clustering',
    'interval_regularity': 'Regular Intervals',
    'size_distribution': 'Size Patterns',
    'coordinated_timing': 'Coordinated Timing',
    'new_wallet_spam': 'New Wallet Spam',
    'wash_trading': 'Wash Trading',
    'buy_sell_imbalance': 'Buy/Sell Imbalance',
    'high_volume_low_liquidity': 'Wash Trading Risk',
    'extreme_volatility': 'Extreme Volatility',
    'high_frequency_low_cap': 'Bot Activity',
  }
  
  return (
    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-white text-sm">
          {patternLabels[pattern.type] || pattern.type}
        </span>
        <span className={`text-xs ${getSeverityColor(pattern.severity)}`}>
          {(pattern.confidence * 100).toFixed(0)}%
        </span>
      </div>
      {pattern.evidence[0] && (
        <p className="text-xs text-slate-400">
          {pattern.evidence[0].description}
        </p>
      )}
    </div>
  )
}

// DexScreener Chart Embed
function TokenChart({ pairAddress, symbol }: { pairAddress: string; symbol?: string }) {
  return (
    <div className="relative w-full h-[400px] rounded-lg overflow-hidden border border-slate-700">
      <iframe
        src={`https://dexscreener.com/solana/${pairAddress}?embed=1&theme=dark&trades=0&info=0`}
        className="w-full h-full border-0"
        title={`${symbol || 'Token'} Chart`}
      />
    </div>
  )
}

// Analysis card for active tokens
function TokenAnalysisCard({ 
  token, 
  report, 
  isLoading,
  onRemove,
  onRefresh 
}: { 
  token: ActiveToken
  report: AnalysisReport | null
  isLoading: boolean
  onRemove: () => void
  onRefresh: () => void
}) {
  const [showChart, setShowChart] = useState(true)
  
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            token.source === 'volume' ? 'bg-purple-500/20 text-purple-400' :
            token.source === 'snipe' ? 'bg-orange-500/20 text-orange-400' :
            'bg-blue-500/20 text-blue-400'
          }`}>
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">
                {report?.symbol || token.symbol || token.mint.slice(0, 8) + '...'}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded ${
                token.source === 'volume' ? 'bg-purple-500/20 text-purple-400' :
                token.source === 'snipe' ? 'bg-orange-500/20 text-orange-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {token.source.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">{token.mint.slice(0, 20)}...{token.mint.slice(-8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={`https://dexscreener.com/solana/${token.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
          </a>
          <button
            onClick={onRemove}
            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400 hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* Price & Stats Row */}
      {report && (
        <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-slate-800/50 rounded-lg">
          <div>
            <p className="text-xs text-slate-500">Price</p>
            <p className="text-lg font-bold text-white">${report.priceUsd || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">24h Change</p>
            <p className={`text-lg font-bold ${
              (parseFloat(report.priceChange24h || '0') || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {report.priceChange24h ? `${report.priceChange24h}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">24h Volume</p>
            <p className="text-lg font-bold text-white">
              ${report.volume24h ? report.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Liquidity</p>
            <p className="text-lg font-bold text-white">
              ${report.liquidity ? report.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Chart Toggle */}
      <div className="mb-4">
        <button
          onClick={() => setShowChart(!showChart)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          {showChart ? 'Hide Chart' : 'Show Chart'}
        </button>
      </div>

      {/* Chart */}
      {showChart && report?.pairAddress && (
        <div className="mb-4">
          <TokenChart pairAddress={report.pairAddress} symbol={report.symbol} />
        </div>
      )}

      {/* Manipulation Score */}
      {report && (
        <div className="flex items-center gap-6 p-4 bg-slate-800/30 rounded-lg mb-4">
          <div className={`w-20 h-20 rounded-full ${getScoreBg(report.manipulationScore)} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`text-2xl font-bold ${getScoreColor(report.manipulationScore)}`}>
                {report.manipulationScore}
              </div>
              <div className="text-xs text-slate-400">Risk</div>
            </div>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-medium ${getScoreColor(report.manipulationScore)} mb-1`}>
              {report.manipulationScore >= 70 ? 'HIGH RISK' :
               report.manipulationScore >= 50 ? 'MODERATE RISK' :
               report.manipulationScore >= 30 ? 'LOW RISK' : 'MINIMAL RISK'}
            </p>
            <p className="text-xs text-slate-400">{report.recommendation}</p>
          </div>
        </div>
      )}

      {/* Detected Patterns */}
      {report && report.patterns.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-2">Detected Patterns</h4>
          <div className="grid grid-cols-2 gap-2">
            {report.patterns.map((pattern, i) => (
              <PatternCard key={i} pattern={pattern} />
            ))}
          </div>
        </div>
      )}

      {/* No issues */}
      {report && report.patterns.length === 0 && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <Shield className="w-5 h-5 text-emerald-400" />
          <p className="text-sm text-emerald-400">No suspicious patterns detected</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !report && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}
    </div>
  )
}

export function DetectionDashboard() {
  const { tokens, addToken, removeToken } = useActiveTokens()
  const [tokenMint, setTokenMint] = useState('')
  const [reports, setReports] = useState<Record<string, AnalysisReport>>({})
  const [loadingTokens, setLoadingTokens] = useState<Set<string>>(new Set())
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // Analyze a token and get report
  const analyzeToken = async (mint: string): Promise<AnalysisReport | null> => {
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const dexData = await dexRes.json();
      
      if (!dexData.pairs || dexData.pairs.length === 0) {
        return null;
      }
      
      const pair = dexData.pairs[0];
      const txns = pair.txns || {};
      const h24 = txns.h24 || { buys: 0, sells: 0 };
      const h1 = txns.h1 || { buys: 0, sells: 0 };
      
      // Calculate manipulation indicators
      const buyRatio = h24.buys / (h24.buys + h24.sells + 1);
      const volumeToLiquidity = (pair.volume?.h24 || 0) / (pair.liquidity?.usd || 1);
      const priceChange = Math.abs(parseFloat(pair.priceChange?.h24 || '0'));
      
      let manipulationScore = 0;
      const patterns: Pattern[] = [];
      
      if (buyRatio > 0.8 || buyRatio < 0.2) {
        manipulationScore += 25;
        patterns.push({
          type: 'buy_sell_imbalance',
          confidence: Math.abs(buyRatio - 0.5) * 2,
          severity: buyRatio > 0.85 || buyRatio < 0.15 ? 'high' : 'medium',
          evidence: [{
            type: 'ratio',
            description: `Buy ratio: ${(buyRatio * 100).toFixed(1)}% (${h24.buys} buys, ${h24.sells} sells)`,
            data: { buyRatio, buys: h24.buys, sells: h24.sells }
          }],
          detectedAt: Date.now()
        });
      }
      
      if (volumeToLiquidity > 5) {
        manipulationScore += 30;
        patterns.push({
          type: 'high_volume_low_liquidity',
          confidence: Math.min(volumeToLiquidity / 10, 1),
          severity: volumeToLiquidity > 10 ? 'high' : 'medium',
          evidence: [{
            type: 'volume_ratio',
            description: `Vol/Liq: ${volumeToLiquidity.toFixed(1)}x — wash trading risk`,
            data: { volume: pair.volume?.h24, liquidity: pair.liquidity?.usd, ratio: volumeToLiquidity }
          }],
          detectedAt: Date.now()
        });
      }
      
      if (priceChange > 50) {
        manipulationScore += 20;
        patterns.push({
          type: 'extreme_volatility',
          confidence: Math.min(priceChange / 100, 1),
          severity: priceChange > 100 ? 'high' : 'medium',
          evidence: [{
            type: 'price_change',
            description: `24h change: ${pair.priceChange?.h24}%`,
            data: { priceChange: pair.priceChange?.h24 }
          }],
          detectedAt: Date.now()
        });
      }
      
      const txPerMinute = (h1.buys + h1.sells) / 60;
      if (txPerMinute > 1 && (pair.liquidity?.usd || 0) < 50000) {
        manipulationScore += 15;
        patterns.push({
          type: 'high_frequency_low_cap',
          confidence: Math.min(txPerMinute / 5, 1),
          severity: txPerMinute > 3 ? 'high' : 'low',
          evidence: [{
            type: 'frequency',
            description: `${txPerMinute.toFixed(2)} tx/min on $${(pair.liquidity?.usd || 0).toLocaleString()} liquidity`,
            data: { txPerMinute, liquidity: pair.liquidity?.usd }
          }],
          detectedAt: Date.now()
        });
      }
      
      let recommendation = '';
      if (manipulationScore >= 60) {
        recommendation = 'Multiple manipulation indicators. Exercise extreme caution.';
      } else if (manipulationScore >= 30) {
        recommendation = 'Some suspicious patterns. Monitor closely.';
      } else if (patterns.length > 0) {
        recommendation = 'Minor anomalies. Likely normal activity.';
      } else {
        recommendation = 'No obvious manipulation detected.';
      }
      
      return {
        tokenMint: mint,
        symbol: pair.baseToken?.symbol,
        name: pair.baseToken?.name,
        analyzedAt: Date.now(),
        transactionCount: h24.buys + h24.sells,
        timeRange: { start: Date.now() - 86400000, end: Date.now() },
        patterns,
        overallConfidence: patterns.length > 0 ? patterns.reduce((a, p) => a + p.confidence, 0) / patterns.length : 0,
        manipulationScore: Math.min(manipulationScore, 100),
        recommendation,
        citation: 'DexScreener',
        priceUsd: pair.priceUsd,
        priceChange24h: pair.priceChange?.h24,
        volume24h: pair.volume?.h24,
        liquidity: pair.liquidity?.usd,
        pairAddress: pair.pairAddress
      };
    } catch (err) {
      console.error('Analysis error:', err);
      return null;
    }
  };

  // Analyze all active tokens on mount and when tokens change
  useEffect(() => {
    const analyzeAll = async () => {
      for (const token of tokens) {
        if (!reports[token.mint]) {
          setLoadingTokens(prev => new Set([...prev, token.mint]));
          const report = await analyzeToken(token.mint);
          if (report) {
            setReports(prev => ({ ...prev, [token.mint]: report }));
          }
          setLoadingTokens(prev => {
            const next = new Set(prev);
            next.delete(token.mint);
            return next;
          });
        }
      }
    };
    analyzeAll();
  }, [tokens]);

  const handleAnalyze = async () => {
    if (!tokenMint) return;
    setIsAnalyzing(true);
    
    const report = await analyzeToken(tokenMint);
    
    if (report) {
      addToken({
        mint: tokenMint,
        symbol: report.symbol,
        name: report.name,
        source: 'manual',
        pairAddress: report.pairAddress
      });
      setReports(prev => ({ ...prev, [tokenMint]: report }));
      setTokenMint('');
    } else {
      alert('Token not found on any DEX');
    }
    
    setIsAnalyzing(false);
  };

  const handleRefresh = async (mint: string) => {
    setLoadingTokens(prev => new Set([...prev, mint]));
    const report = await analyzeToken(mint);
    if (report) {
      setReports(prev => ({ ...prev, [mint]: report }));
    }
    setLoadingTokens(prev => {
      const next = new Set(prev);
      next.delete(mint);
      return next;
    });
  };

  const handleRemove = (mint: string) => {
    removeToken(mint);
    setReports(prev => {
      const next = { ...prev };
      delete next[mint];
      return next;
    });
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Detection Dashboard</h2>
        <p className="text-slate-400 mt-1">
          Real-time analysis of tokens you're trading
        </p>
      </div>
      
      {/* Add Token Bar */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Add token mint address to track..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button 
            className="btn-primary"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Token
              </>
            )}
          </button>
        </div>
      </div>

      {/* Active Tokens Summary */}
      {tokens.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-slate-400">Tracking {tokens.length} token(s):</span>
          {tokens.map(token => (
            <div key={token.mint} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-full">
              <span className={`w-2 h-2 rounded-full ${
                token.source === 'volume' ? 'bg-purple-400' :
                token.source === 'snipe' ? 'bg-orange-400' : 'bg-blue-400'
              }`} />
              <span className="text-sm text-white font-medium">
                {reports[token.mint]?.symbol || token.mint.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Token Analysis Cards */}
      {tokens.length > 0 ? (
        <div className="space-y-6">
          {tokens.map(token => (
            <TokenAnalysisCard
              key={token.mint}
              token={token}
              report={reports[token.mint] || null}
              isLoading={loadingTokens.has(token.mint)}
              onRemove={() => handleRemove(token.mint)}
              onRefresh={() => handleRefresh(token.mint)}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Eye className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No tokens tracked yet</h3>
          <p className="text-slate-400 mb-4">
            Start volume boosting or sniping to automatically see charts here,<br />
            or add a token manually above.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-400" />
              <span className="text-slate-500">Volume Boosting</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-400" />
              <span className="text-slate-500">Sniping</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-400" />
              <span className="text-slate-500">Manual</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DetectionDashboard
