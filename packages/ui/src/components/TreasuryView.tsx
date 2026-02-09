import { useState } from 'react';
import { Wallet, Send, QrCode, History, AlertCircle } from 'lucide-react';

interface WalletStatus {
  address: string;
  balance: number;
  target: number;
  needsFunding: boolean;
}

interface TreasuryStatus {
  mainWallet: string;
  mainBalance: number;
  sniperWallets: WalletStatus[];
  totalNeeded: number;
  canFundAll: boolean;
}

export function TreasuryView() {
  const [status] = useState<TreasuryStatus>({
    mainWallet: '7VHsSm...3Jv',
    mainBalance: 1.5,
    sniperWallets: [
      { address: '8KjPmN...4Wx', balance: 0.02, target: 0.05, needsFunding: true },
      { address: '9LmQoP...5Yz', balance: 0.05, target: 0.05, needsFunding: false },
    ],
    totalNeeded: 0.03,
    canFundAll: true,
  });
  const [showQR, setShowQR] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-500" />
          Treasury
        </h1>
        <div className="text-sm text-gray-400">
          Main wallet funding & distribution
        </div>
      </div>

      {/* Main Wallet Card */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Main Wallet</h2>
            <p className="text-gray-400 text-sm font-mono">{status.mainWallet}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-400">
              {status.mainBalance.toFixed(4)} SOL
            </div>
            <div className="text-sm text-gray-400">Available</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowQR(!showQR)}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-white transition-colors"
          >
            <QrCode className="w-4 h-4" />
            {showQR ? 'Hide QR' : 'Fund via QR'}
          </button>
          <button
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-white transition-colors"
          >
            <Send className="w-4 h-4" />
            Distribute to Snipers
          </button>
        </div>

        {/* QR Code Area */}
        {showQR && (
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-32 h-32 bg-white p-2 rounded-lg">
                {/* QR Placeholder - in real app use QR library */}
                <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white text-xs text-center">
                  QR Code\nsolana:{status.mainWallet}
                </div>
              </div>
              <div>
                <p className="text-white font-medium">Scan to Fund Treasury</p>
                <p className="text-gray-400 text-sm">Send SOL to this address</p>
                <button
                  onClick={() => navigator.clipboard.writeText(status.mainWallet)}
                  className="mt-2 text-emerald-400 text-sm hover:underline"
                >
                  Copy Address
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sniper Wallets Grid */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Sniper Wallets</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {status.sniperWallets.map((wallet) => (
            <div
              key={wallet.address}
              className={`bg-gray-800 rounded-lg p-4 border ${
                wallet.needsFunding ? 'border-amber-500/50' : 'border-emerald-500/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 font-mono text-sm">
                  {wallet.address}
                </span>
                {wallet.needsFunding ? (
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                ) : (
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                )}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-white">
                    {wallet.balance.toFixed(4)} SOL
                  </div>
                  <div className="text-sm text-gray-400">
                    Target: {wallet.target} SOL
                  </div>
                </div>
                <div className={`text-sm font-medium ${
                  wallet.needsFunding ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {wallet.needsFunding ? 'Needs Funding' : 'Funded'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-400" />
            <span className="text-gray-400">Total Needed:</span>
            <span className="text-white font-mono">{status.totalNeeded.toFixed(4)} SOL</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            status.canFundAll
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}>
            {status.canFundAll ? '✅ Can Fund All' : '⚠️ Insufficient Funds'}
          </div>
        </div>
      </div>
    </div>
  );
}
