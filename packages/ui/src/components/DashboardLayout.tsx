import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { 
  Wallet, 
  Target, 
  Shield, 
  LineChart, 
  Settings, 
  LockKeyhole,
  Menu,
  Activity,
  Zap,
  Bot,
  Eye,
  Volume2
} from 'lucide-react'
import { WalletProvider } from '@/context/WalletContext'
import { TreasuryView } from './TreasuryView'
import { WalletManagerBrowser } from './WalletManagerBrowser'
import { SniperControl } from './SniperControl'
import { ShieldScanner } from './ShieldScanner'
import { PnLCharts } from './PnLCharts'
import { ActivityGenerator } from './ActivityGenerator'
import { SettingsPanel } from './SettingsPanel'
import { BotManager } from './BotManager'
import { DetectionDashboard } from './DetectionDashboard'
import { VolumeControl } from './VolumeControl'

const navItems = [
  { path: '/treasury', label: 'Treasury', icon: LockKeyhole, description: 'Main funding & balances' },
  { path: '/wallets', label: 'Wallets', icon: Wallet, description: 'HD wallet management' },
  { path: '/snipe', label: 'Sniper', icon: Target, description: 'Token sniping control' },
  { path: '/shield', label: 'Shield', icon: Shield, description: 'Security scanner' },
  { path: '/pnl', label: 'P&L', icon: LineChart, description: 'Portfolio analytics' },
  { path: '/activity', label: 'Activity', icon: Activity, description: 'Generate fake tx history' },
  { path: '/bots', label: 'Bots', icon: Bot, description: 'Market maker bots' },
  { path: '/detection', label: 'Detection', icon: Eye, description: 'Manipulation analysis' },
  { path: '/volume', label: 'Volume', icon: Volume2, description: 'Volume boosting' },
  { path: '/settings', label: 'Settings', icon: Settings, description: 'Configuration' },
]

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const currentPath = window.location.pathname
  
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-slate-900 border-r border-slate-800
        transform transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">TrenchSniper</h1>
              <p className="text-xs text-slate-400">Operating System</p>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPath === item.path
            
            return (
              <a
                key={item.path}
                href={item.path}
                className={`
                  nav-item ${isActive ? 'nav-item-active bg-slate-800/50' : ''}
                  group relative
                `}
                onClick={(e) => {
                  e.preventDefault()
                  window.history.pushState({}, '', item.path)
                  window.dispatchEvent(new PopStateEvent('popstate'))
                  onClose()
                }}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-emerald-400'}`} />
                <div className="flex-1">
                  <span className={`font-medium ${isActive ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {item.label}
                  </span>
                  <p className="text-xs text-slate-500 hidden xl:block">{item.description}</p>
                </div>
                {isActive && (
                  <div className="absolute right-0 w-1 h-8 bg-emerald-500 rounded-l" />
                )}
              </a>
            )
          })}
        </nav>
        
        {/* Footer status */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-800/50">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-slate-300">System Ready</span>
          </div>
        </div>
      </aside>
    </>
  )
}

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Menu className="w-5 h-5 text-slate-400" />
        </button>
        <div className="hidden md:flex items-center gap-2 text-sm text-slate-400">
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400">
            {navItems.find(i => i.path === window.location.pathname)?.label || 'Dashboard'}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-slate-500">RPC:</span>
          <span className="text-xs text-emerald-400">devnet</span>
        </div>
        <div className="w-px h-6 bg-slate-700 hidden sm:block" />
        <button className="btn-primary text-sm">
          Connect Wallet
        </button>
      </div>
    </header>
  )
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [, setCurrentPath] = useState(window.location.pathname)
  
  // Listen for navigation changes
  window.addEventListener('popstate', () => {
    setCurrentPath(window.location.pathname)
  })
  
  // Wrapper to pass the path
  const RouteContent = () => {
    const path = window.location.pathname
    
    switch (path) {
      case '/treasury': return <TreasuryView />
      case '/wallets': return <WalletManagerBrowser />
      case '/snipe': return <SniperControl />
      case '/shield': return <ShieldScanner />
      case '/pnl': return <PnLCharts />
      case '/activity': return <ActivityGenerator />
      case '/bots': return <BotManager />
      case '/detection': return <DetectionDashboard />
      case '/volume': return <VolumeControl />
      case '/settings': return <SettingsPanel />
      default: return <Navigate to="/treasury" />
    }
  }
  
  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <RouteContent />
          </div>
        </main>
      </div>
    </div>
  )
}

export function DashboardLayout() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  )
}

export default DashboardLayout;
