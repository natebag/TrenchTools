import { useNetwork } from '@/context/NetworkContext';

export function SettingsPanel() {
  const { network, rpcUrl, setNetwork } = useNetwork();

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
              value={rpcUrl}
              readOnly
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-1">
              RPC is set automatically based on network selection
            </p>
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
                <span className="text-slate-500">Status:</span>
                <span className="ml-2 text-emerald-400 font-medium">Connected</span>
              </div>
            </div>
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
