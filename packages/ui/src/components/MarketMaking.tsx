import { useState } from 'react'
import { Volume2, Bot } from 'lucide-react'
import { VolumeControl } from './VolumeControl'
import { BotGroups } from './BotGroups'

type Tab = 'manual' | 'bots'

export function MarketMaking() {
  const [activeTab, setActiveTab] = useState<Tab>('manual')

  return (
    <div className="space-y-6">
      {/* Header + sub-tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Market Making</h2>
          <p className="text-slate-400 text-sm mt-1">Volume boosting & automated bot groups</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            Manual Volume
          </button>
          <button
            onClick={() => setActiveTab('bots')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              activeTab === 'bots'
                ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <Bot className="w-4 h-4" />
            Bot Groups
          </button>
        </div>
      </div>

      {/* Both always mounted, toggled via CSS hidden to preserve running state */}
      <div className={activeTab === 'manual' ? '' : 'hidden'}>
        <VolumeControl />
      </div>
      <div className={activeTab === 'bots' ? '' : 'hidden'}>
        <BotGroups />
      </div>
    </div>
  )
}
