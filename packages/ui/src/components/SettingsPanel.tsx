import { useState } from 'react';

export function SettingsPanel() {
  const [rpcUrl, setRpcUrl] = useState('https://api.devnet.solana.com');
  const [network, setNetwork] = useState<'devnet' | 'mainnet'>('devnet');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-slate-400">Configure your TrenchSniper instance</p>
      </div>

      <div className="card">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Network
            </label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as 'devnet' | 'mainnet')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="devnet">Devnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              RPC URL
            </label>
            <input
              type="text"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
              placeholder="https://..."
            />
          </div>

          <button className="btn-primary">Save Settings</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
