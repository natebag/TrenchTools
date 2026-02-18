<div>
  <label className="block text-sm text-slate-400 mb-1">Wallet Name</label>
  <input
    type="text"
    value={newWalletName}
    onChange={(e) => setNewWalletName(e.target.value)}
    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
    placeholder="e.g., Sniper 1"
  />
</div>
<div>
  <label className="block text-sm text-slate-400 mb-1">Wallet Type</label>
  <select
    value={newWalletType}
    onChange={(e) => setNewWalletType(e.target.value as 'sniper' | 'treasury' | 'burner')}
    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg"
  >
    <option value="sniper">Sniper</option>
    <option value="treasury">Treasury</option>
    <option value="burner">Burner</option>
  </select>
</div>
<div>