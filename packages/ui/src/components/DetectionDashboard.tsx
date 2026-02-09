import { useState } from 'react'
import { 
  Search, 
  Shield, 
  Eye,
  RefreshCw
} from 'lucide-react'

// Types for Detection integration
interface AnalysisReport {
  tokenMint: string
  analyzedAt: number
  transactionCount: number
  timeRange: { start: number; end: number }
  patterns: Pattern[]
  overallConfidence: number
  manipulationScore: number
  recommendation: string
  citation: 'Powered by Allium'
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

interface Alert {
  id: string
  timestamp: number
  priority: 'low' | 'medium' | 'high' | 'critical'
  token: { mint: string; symbol?: string }
  patterns: Pattern[]
  confidence: number
  recommendation: string
}

// Mock data for UI demonstration
const mockReport: AnalysisReport = {
  tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  analyzedAt: Date.now(),
  transactionCount: 1256,
  timeRange: { start: Date.now() - 86400000, end: Date.now() },
  patterns: [
    {
      type: 'interval_regularity',
      confidence: 0.78,
      severity: 'medium',
      evidence: [{
        type: 'interval_overall',
        description: 'Overall transaction timing shows regular patterns',
        data: { meanIntervalSeconds: 45, coefficientOfVariation: '0.35' }
      }],
      detectedAt: Date.now()
    },
    {
      type: 'coordinated_timing',
      confidence: 0.65,
      severity: 'medium',
      evidence: [{
        type: 'timing_summary',
        description: '5 coordinated timing events detected',
        data: { eventCount: 5, totalWallets: 12 }
      }],
      detectedAt: Date.now()
    },
    {
      type: 'size_distribution',
      confidence: 0.42,
      severity: 'low',
      evidence: [{
        type: 'size_statistics',
        description: 'Some round number patterns detected',
        data: { uniqueSizes: 23, distribution: 'modal' }
      }],
      detectedAt: Date.now()
    }
  ],
  overallConfidence: 0.62,
  manipulationScore: 58,
  recommendation: 'MODERATE RISK: Some suspicious patterns detected. Monitor closely.',
  citation: 'Powered by Allium'
}

const mockAlerts: Alert[] = [
  {
    id: 'alert-001',
    timestamp: Date.now() - 300000,
    priority: 'high',
    token: { mint: 'So111...', symbol: 'SOL' },
    patterns: [{ type: 'wallet_clustering', confidence: 0.85, severity: 'high', evidence: [], detectedAt: Date.now() }],
    confidence: 0.85,
    recommendation: 'Multiple wallets appear connected - possible coordinated activity'
  },
  {
    id: 'alert-002',
    timestamp: Date.now() - 1800000,
    priority: 'medium',
    token: { mint: 'EPjF...', symbol: 'USDC' },
    patterns: [{ type: 'interval_regularity', confidence: 0.72, severity: 'medium', evidence: [], detectedAt: Date.now() }],
    confidence: 0.72,
    recommendation: 'Trading intervals are too regular for human behavior'
  },
  {
    id: 'alert-003',
    timestamp: Date.now() - 7200000,
    priority: 'low',
    token: { mint: 'Es9v...', symbol: 'USDT' },
    patterns: [{ type: 'size_distribution', confidence: 0.45, severity: 'low', evidence: [], detectedAt: Date.now() }],
    confidence: 0.45,
    recommendation: 'Transaction sizes follow slightly unnatural patterns'
  }
]

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

function getPriorityColor(priority: Alert['priority']): string {
  switch (priority) {
    case 'critical': return 'text-red-400 bg-red-500/20'
    case 'high': return 'text-orange-400 bg-orange-500/20'
    case 'medium': return 'text-yellow-400 bg-yellow-500/20'
    case 'low': return 'text-blue-400 bg-blue-500/20'
  }
}

function getSeverityColor(severity: Pattern['severity']): string {
  switch (severity) {
    case 'high': return 'text-red-400'
    case 'medium': return 'text-yellow-400'
    case 'low': return 'text-blue-400'
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  const patternLabels: Record<string, string> = {
    'wallet_clustering': 'Wallet Clustering',
    'interval_regularity': 'Regular Intervals',
    'size_distribution': 'Size Patterns',
    'coordinated_timing': 'Coordinated Timing',
    'new_wallet_spam': 'New Wallet Spam',
    'wash_trading': 'Wash Trading',
  }
  
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white">
          {patternLabels[pattern.type] || pattern.type}
        </span>
        <span className={`text-sm ${getSeverityColor(pattern.severity)}`}>
          {(pattern.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      {pattern.evidence[0] && (
        <p className="text-sm text-slate-400">
          {pattern.evidence[0].description}
        </p>
      )}
    </div>
  )
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(alert.priority)}`}>
            {alert.priority.toUpperCase()}
          </span>
          <span className="font-medium text-white">{alert.token.symbol || alert.token.mint.slice(0, 8)}</span>
        </div>
        <span className="text-sm text-slate-500">{formatTimeAgo(alert.timestamp)}</span>
      </div>
      <p className="text-sm text-slate-400">{alert.recommendation}</p>
    </div>
  )
}

export function DetectionDashboard() {
  const [tokenMint, setTokenMint] = useState('')
  const [report, setReport] = useState<AnalysisReport | null>(mockReport)
  const [alerts] = useState<Alert[]>(mockAlerts)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const handleAnalyze = async () => {
    if (!tokenMint) return
    setIsAnalyzing(true)
    // In production, this would call the DetectionEngine
    setTimeout(() => {
      setReport(mockReport)
      setIsAnalyzing(false)
    }, 1500)
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Detection Dashboard</h2>
        <p className="text-slate-400 mt-1">Analyze tokens for manipulation patterns</p>
      </div>
      
      {/* Search Bar */}
      <div className="card">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Enter token mint address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
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
                Analyzing...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Analyze
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Analysis Report */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Score */}
          <div className="lg:col-span-2 space-y-4">
            {/* Score Card */}
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Manipulation Analysis</h3>
                <span className="text-xs text-slate-500">{report.citation}</span>
              </div>
              
              <div className="flex items-center gap-8 mb-6">
                <div className={`w-32 h-32 rounded-full ${getScoreBg(report.manipulationScore)} flex items-center justify-center`}>
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${getScoreColor(report.manipulationScore)}`}>
                      {report.manipulationScore}
                    </div>
                    <div className="text-sm text-slate-400">Score</div>
                  </div>
                </div>
                
                <div className="flex-1">
                  <p className={`text-lg font-medium ${getScoreColor(report.manipulationScore)} mb-2`}>
                    {report.manipulationScore >= 70 ? 'HIGH RISK' :
                     report.manipulationScore >= 50 ? 'MODERATE RISK' :
                     report.manipulationScore >= 30 ? 'LOW RISK' : 'MINIMAL RISK'}
                  </p>
                  <p className="text-slate-400">{report.recommendation}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700/50">
                <div>
                  <p className="text-sm text-slate-500">Transactions</p>
                  <p className="text-xl font-semibold text-white">{report.transactionCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Patterns Found</p>
                  <p className="text-xl font-semibold text-white">{report.patterns.length}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Confidence</p>
                  <p className="text-xl font-semibold text-white">{(report.overallConfidence * 100).toFixed(0)}%</p>
                </div>
              </div>
            </div>
            
            {/* Detected Patterns */}
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-4">Detected Patterns</h3>
              <div className="space-y-3">
                {report.patterns.map((pattern, i) => (
                  <PatternCard key={i} pattern={pattern} />
                ))}
                
                {report.patterns.length === 0 && (
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-slate-400">No suspicious patterns detected</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Sidebar - Recent Alerts */}
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Recent Alerts</h3>
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                  {alerts.length} Active
                </span>
              </div>
              
              <div className="space-y-3">
                {alerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-4">Detection Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Tokens Monitored</span>
                  <span className="font-semibold text-white">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Alerts (24h)</span>
                  <span className="font-semibold text-white">7</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Analyses Run</span>
                  <span className="font-semibold text-white">156</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DetectionDashboard
