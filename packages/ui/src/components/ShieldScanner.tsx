import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, Search } from 'lucide-react';

interface RiskCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  score: number;
}

interface ScanResult {
  safe: boolean;
  score: number;
  isHoneypot: boolean;
  checks: RiskCheck[];
}

export function ShieldScanner() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result] = useState<ScanResult | null>({
    safe: false,
    score: 85,
    isHoneypot: false,
    checks: [
      { name: 'Mint Authority', status: 'pass', score: 0 },
      { name: 'Freeze Authority', status: 'warning', score: 15 },
      { name: 'Sell Enabled', status: 'pass', score: 0 },
      { name: 'Low Sell Fee', status: 'pass', score: 0 },
    ],
  });

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-emerald-500" />
        <h1 className="text-2xl font-bold text-white">Shield Scanner</h1>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex gap-3">
          <input
            type="text"
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="Enter token address to scan..."
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono"
          />
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Scan
              </>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg p-6 border ${
          result.safe ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {result.safe ? (
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
            <div>
              <h2 className={`text-xl font-bold ${result.safe ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.safe ? 'SAFE TO TRADE' : 'RISK DETECTED'}
              </h2>
              <p className="text-gray-400">Risk Score: {result.score}/100</p>
            </div>
          </div>

          <div className="space-y-2">
            {result.checks.map((check) => (
              <div key={check.name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded">
                <span className="text-white">{check.name}</span>
                <div className="flex items-center gap-2">
                  {check.status === 'pass' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                  {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                  {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                  <span className={`text-sm ${
                    check.status === 'pass' ? 'text-emerald-400' :
                    check.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {check.status === 'pass' ? 'PASS' : check.status === 'warning' ? 'WARNING' : 'FAIL'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
