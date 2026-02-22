/**
 * Chain Selector — dropdown to switch between supported chains.
 *
 * Shows the current chain with its themed color, and a dropdown
 * to pick Solana / BSC / Base. Placed in the DashboardLayout header.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useChain } from '@/context/ChainContext';
import { type ChainId, CHAINS, ACTIVE_CHAIN_IDS } from '@trenchtools/core';

// Chain icons as simple SVG components (small inline icons)
type IconProps = { className?: string; style?: React.CSSProperties };

const chainIcons: Record<ChainId, (props: IconProps) => JSX.Element> = {
  solana: ({ className, style }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M5.26 16.57l2.52-2.63a.44.44 0 01.32-.14h12.19a.22.22 0 01.16.37l-2.52 2.63a.44.44 0 01-.32.14H5.42a.22.22 0 01-.16-.37zM5.26 7.06l2.52-2.63a.44.44 0 01.32-.14h12.19a.22.22 0 01.16.37l-2.52 2.63a.44.44 0 01-.32.14H5.42a.22.22 0 01-.16-.37zM18.45 11.75l-2.52-2.63a.44.44 0 00-.32-.14H3.42a.22.22 0 00-.16.37l2.52 2.63a.44.44 0 00.32.14h12.19a.22.22 0 00.16-.37z" />
    </svg>
  ),
  bsc: ({ className, style }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2L7.5 6.5 9.62 8.62 12 6.24l2.38 2.38L16.5 6.5 12 2zM2 12l2.12-2.12L6.24 12l-2.12 2.12L2 12zm10 0l2.12-2.12L16.24 12l-2.12 2.12L12 12zm-4.38 0L5.5 14.12 7.62 16.24 12 11.86l4.38 4.38 2.12-2.12L12 7.76 5.62 14.12zm10.14 0L19.88 14.12 22 12l-2.12-2.12L17.76 12zM12 17.76l-2.38-2.38-2.12 2.12L12 22l4.5-4.5-2.12-2.12L12 17.76z" />
    </svg>
  ),
  base: ({ className, style }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 6a6 6 0 100 12 6 6 0 000-12z" />
    </svg>
  ),
  sui: ({ className, style }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 2.13 3 4.76 0 1.37-.42 2.61-1.1 3.52L12 16l-1.9-2.72C9.42 12.37 9 11.13 9 9.76 9 7.13 10.34 5 12 5z" />
    </svg>
  ),
};

export function ChainSelector() {
  const { chain, setChain, chainConfig } = useChain();
  const [isOpen, setIsOpen] = useState(false);

  const Icon = chainIcons[chain];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-slate-800"
        style={{
          backgroundColor: `${chainConfig.color}15`,
          color: chainConfig.color,
        }}
      >
        <Icon className="w-4 h-4" />
        <span>{chainConfig.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {ACTIVE_CHAIN_IDS.map((chainId) => {
              const cfg = CHAINS[chainId];
              const ChainIcon = chainIcons[chainId];
              const isActive = chainId === chain;

              return (
                <button
                  key={chainId}
                  onClick={() => {
                    setChain(chainId);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-slate-700 transition-colors ${
                    isActive ? 'bg-slate-700/50' : ''
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${cfg.color}20` }}
                  >
                    <ChainIcon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                  </div>
                  <div className="flex-1">
                    <span style={{ color: isActive ? cfg.color : undefined }}>
                      {cfg.name}
                    </span>
                    <span className="ml-1 text-xs text-slate-500">{cfg.nativeToken}</span>
                  </div>
                  {isActive && (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cfg.color }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
