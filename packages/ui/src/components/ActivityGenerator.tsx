import { useState } from 'react';

export function ActivityGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Activity Generator</h2>
        <p className="text-slate-400">Generate transaction history for wallets</p>
      </div>

      <div className="card">
        <div className="p-6">
          <p className="text-slate-400">Activity generation features coming soon...</p>
          <button
            onClick={() => setIsGenerating(!isGenerating)}
            className="mt-4 btn-primary"
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Start Generation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActivityGenerator;
