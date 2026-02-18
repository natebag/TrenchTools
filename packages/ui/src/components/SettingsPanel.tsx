import { useEffect, useState } from 'react';
import { useNetwork } from '@/context/NetworkContext';

export function SettingsPanel() {
  const {
    network,
    rpcUrl,
    defaultRpcUrl,
    customRpcUrl,
    isCustomRpc,
    setNetwork,
    setCustomRpcUrl,
    clearCustomRpc,
  } = useNetwork();
  const [rpcInput, setRpcInput] = useState(customRpcUrl ?? '');
  const [rpcError, setRpcError] = useState('');
  const [rpcSaved, setRpcSaved] = useState(false);
  const [jupiterKey, setJupiterKey] = useState(() => localStorage.getItem('jupiter_api_key') || '');
  const [jupiterSaved, setJupiterSaved] = useState(false);

  useEffect(() => {
    setRpcInput(customRpcUrl ?? '');
    setRpcError('');
  }, [customRpcUrl]);

  const saveCustomRpc = () => {
    const next = rpcInput.trim();
    if (!next) {
      setRpcError('RPC URL is required.');
      setRpcSaved(false);
      return;
    }

    try {
      const parsed = new URL(next);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        setRpcError('RPC URL must start with http:// or https://');
        setRpcSaved(false);
        return;
      }
    } catch {
      setRpcError('Enter a valid RPC URL.');
      setRpcSaved(false);
      return;
    }

    setCustomRpcUrl(next);
    setRpcError('');
    setRpcSaved(true);
  };

  const resetCustomRpc = () => {
    clearCustomRpc();
    setRpcSaved(false);
    setRpcError('');
  };

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
            <div className="flex gap-4">
              <button
                onClick={() => setNetwork('mainnet')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                  network === 'mainnet'
                    ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${network === 'mainnet' ? 'bg-orange-400' : 'bg-slate-600'}`} />
                  <span className="font-medium">Mainnet</span>
                </div>
                <p className="text-xs mt-1 opacity-70">Real transactions</p>
              </button>
              <button
                onClick={() => setNetwork('devnet')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                  network === 'devnet'
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${network === 'devnet' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="font-medium">Devnet</span>
                </div>
                <p className="text-xs mt-1 opacity-70">Test tokens only</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              RPC URL
            </label>
            <input
              type="text"
              value={rpcInput}
              onChange={(e) => {
                setRpcInput(e.target.value);
                setRpcSaved(false);
                if (rpcError) setRpcError('');
              }}
              placeholder="https://your-rpc-provider.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            />
            <p className="text-xs text-slate-500 mt-1">
              Current endpoint: {rpcUrl}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Network default: {defaultRpcUrl}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveCustomRpc}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white"
              >
                Save Manual RPC
              </button>
              <button
                onClick={resetCustomRpc}
                disabled={!isCustomRpc}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-100"
              >
                Use Network Default
              </button>
            </div>
            {rpcError && <p className="text-xs text-red-400 mt-2">{rpcError}</p>}
            {rpcSaved && !rpcError && <p className="text-xs text-emerald-400 mt-2">Manual RPC saved.</p>}
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Current Status</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <span className="text-slate-500">Network:</span>
                <span className={`ml-2 font-medium ${network === 'mainnet' ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {network === 'mainnet' ? 'Mainnet-Beta' : 'Devnet'}
                </span>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <span className="text-slate-500">RPC Mode:</span>
                <span className={`ml-2 font-medium ${isCustomRpc ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {isCustomRpc ? 'Manual' : 'Default'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Jupiter API Key
            </label>
            <input
              type="password"
              value={jupiterKey}
              onChange={(e) => {
                setJupiterKey(e.target.value);
                setJupiterSaved(false);
              }}
              placeholder="Enter your Jupiter API key..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            />
            <p className="text-xs text-slate-500 mt-1">
              Required for swaps. Get a free key at{' '}
              <a href="https://portal.jup.ag" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                portal.jup.ag
              </a>
            </p>
            <div className="mt-3">
              <button
                onClick={() => {
                  if (jupiterKey.trim()) {
                    localStorage.setItem('jupiter_api_key', jupiterKey.trim());
                  } else {
                    localStorage.removeItem('jupiter_api_key');
                  }
                  setJupiterSaved(true);
                }}
                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white"
              >
                Save API Key
              </button>
            </div>
            {jupiterSaved && <p className="text-xs text-emerald-400 mt-2">Jupiter API key saved.</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-6">
          <h3 className="text-lg font-medium text-white mb-4">Danger Zone</h3>
          <p className="text-slate-400 text-sm mb-4">
            Clear all local data including encrypted wallets. This cannot be undone.
          </p>
          <button 
            onClick={() => {
              if (confirm('Are you sure? This will delete all wallets and settings.')) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm"
          >
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
