import { useState } from 'react';
import { Wallet, Key, Lock, Unlock, Eye, EyeOff } from 'lucide-react';

interface WalletInfo {
  name: string;
  address: string;
  balance: number;
  encrypted: boolean;
}

export function WalletManager() {
  const [showKeys, setShowKeys] = useState(false);
  const [wallets] = useState<WalletInfo[]>([
    { name: 'Sniper 1', address: '8KjPmN...4Wx', balance: 0.05, encrypted: true },
    { name: 'Sniper 2', address: '9LmQoP...5Yz', balance: 0.03, encrypted: true },
    { name: 'Sniper 3', address: '1RsXzA...6Bc', balance: 0.07, encrypted: true },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-500" />
          Wallet Manager
        </h1>
        <button
          onClick={() => setShowKeys(!showKeys)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          {showKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showKeys ? 'Hide Keys' : 'Show Keys'}
        </button>
      </div>

      <div className="grid gap-4">
        {wallets.map((wallet) => (
          <div
            key={wallet.address}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${wallet.encrypted ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                {wallet.encrypted ? (
                  <Lock className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Unlock className="w-5 h-5 text-amber-500" />
                )}
              </div>
              <div>
                <p className="text-white font-medium">{wallet.name}</p>
                <p className="text-sm text-gray-500 font-mono">{wallet.address}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-white">{wallet.balance.toFixed(4)} SOL</p>
              <p className="text-xs text-emerald-500">{wallet.encrypted ? 'Encrypted' : 'Unencrypted'}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-emerald-500" />
          <h2 className="font-semibold text-white">Mnemonic Backup</h2>
        </div>
        <div className="bg-gray-900 rounded p-3">
          <p className="text-sm text-gray-500 mb-2">Seed phrase (encrypted):</p>
          <code className="text-gray-400 text-sm font-mono">
            {showKeys ? 'apple banana cherry desert elephant fox grape hello internet jungle king lion' : '••••••••••••••••••••••••••••••••••••••••'}
          </code>
        </div>
      </div>
    </div>
  );
}
