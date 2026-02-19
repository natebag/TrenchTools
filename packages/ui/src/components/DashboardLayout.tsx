import { useState, useEffect } from 'react'
import { 
  Wallet, 
  Target, 
  Shield, 
  LineChart, 
  Settings, 
  Menu,
  Activity,
  Zap,
  Eye,
  Volume2,
  RefreshCw,
  Lock,
  Copy,
  ArrowDown,
  ArrowUp,
  Plus,
  Fish,
  LogOut,
  User
} from 'lucide-react'
import { WithdrawModal } from './WithdrawModal'
import { IS_HOSTED } from '@/lib/env'
import { AuthProvider } from '@/context/AuthContext'
import { AuthGate } from './AuthGate'
import { WalletProvider } from '@/context/WalletContext'
import { NetworkProvider, useNetwork } from '@/context/NetworkContext'
import { ActiveTokensProvider } from '@/context/ActiveTokensContext'
import { TxHistoryProvider } from '@/context/TxHistoryContext'
import { PnLProvider } from '@/context/PnLContext'
import { WhaleProvider } from '@/context/WhaleContext'
import { ToastProvider } from './Toast'
import { ErrorBoundary } from './ErrorBoundary'
import { Dashboard } from './Dashboard'
// WalletManagerBrowser available if needed
import { TreasuryWalletManager } from './TreasuryWalletManager'
import { SniperControl } from './SniperControl'
import { ShieldScanner } from './ShieldScanner'
import { PnLCharts } from './PnLCharts'
import { ActivityGenerator } from './ActivityGenerator'
import { SettingsPanel } from './SettingsPanel'
import { DetectionDashboard } from './DetectionDashboard'
import { MarketMaking } from './MarketMaking'
import { TokenChart } from './TokenChart'
import { WhaleAlerts } from './WhaleAlerts'

const navItems = [
  { path: '/', label: 'Dashboard', icon: Activity, description: 'Overview & quick actions' },
  { path: '/wallets', label: 'Wallets', icon: Wallet, description: 'HD wallet management' },
  { path: '/snipe', label: 'Sniper', icon: Target, description: 'Token sniping control' },
  { path: '/shield', label: 'Shield', icon: Shield, description: 'Security scanner' },
  { path: '/whales', label: 'Whales', icon: Fish, description: 'Whale alerts' },
  { path: '/pnl', label: 'P&L', icon: LineChart, description: 'Portfolio analytics' },
  { path: '/activity', label: 'Activity', icon: Activity, description: 'Generate wallet tx history' },
  { path: '/market-making', label: 'Market Making', icon: Volume2, description: 'Volume & automated bots' },
  { path: '/detection', label: 'Detection', icon: Eye, description: 'Manipulation analysis' },
  { path: '/charts', label: 'Charts', icon: LineChart, description: 'Token price charts' },
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

function NetworkSwitcher() {
  const { network, setNetwork } = useNetwork();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          network === 'mainnet' 
            ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' 
            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
        {network === 'mainnet' ? 'Mainnet' : 'Devnet'}
        <RefreshCw className="w-3 h-3" />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <button
              onClick={() => { setNetwork('mainnet'); setIsOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-slate-700 ${
                network === 'mainnet' ? 'text-orange-400 bg-slate-700/50' : 'text-slate-300'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-orange-400" />
              Mainnet
              {network === 'mainnet' && <span className="ml-auto">✓</span>}
            </button>
            <button
              onClick={() => { setNetwork('devnet'); setIsOpen(false); }}
              className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-slate-700 ${
                network === 'devnet' ? 'text-emerald-400 bg-slate-700/50' : 'text-slate-300'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              Devnet
              {network === 'devnet' && <span className="ml-auto">✓</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WalletButton() {
  const { rpcUrl, network } = useNetwork();
  const [wallet, setWallet] = useState<{ address: string; balance: number; name?: string } | null>(null);
  const [allWallets, setAllWallets] = useState<Array<{ address: string; balance: number; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [depositCopied, setDepositCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    const checkWallet = async () => {
      try {
        const vaultData = localStorage.getItem('trenchsniper_secure_wallets');
        if (!vaultData) return;
        
        const activeWallet = localStorage.getItem('trench_active_wallet');
        if (activeWallet) {
          const parsed = JSON.parse(activeWallet);
          setWallet(parsed);
          
          // Try to get all wallets
          const allWalletsData = localStorage.getItem('trench_all_wallets');
          if (allWalletsData) {
            setAllWallets(JSON.parse(allWalletsData));
          }
          
          setIsLoading(true);
          const { Connection, PublicKey } = await import('@solana/web3.js');
          const conn = new Connection(rpcUrl, 'confirmed');
          const balance = await conn.getBalance(new PublicKey(parsed.address));
          setWallet({ ...parsed, balance: balance / 1e9 });
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Wallet check error:', err);
        setIsLoading(false);
      }
    };
    
    checkWallet();
    const handleStorage = () => checkWallet();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('wallet-updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('wallet-updated', handleStorage);
    };
  }, [rpcUrl]);

  const handleDisconnect = () => {
    localStorage.removeItem('trench_active_wallet');
    localStorage.removeItem('trench_all_wallets');
    setWallet(null);
    setIsOpen(false);
    window.dispatchEvent(new Event('wallet-updated'));
  };

  const copyAddress = () => {
    if (wallet) {
      navigator.clipboard.writeText(wallet.address);
    }
  };

  if (wallet) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-slate-300 font-mono">
            {wallet.address.slice(0, 4)}...{wallet.address.slice(-4)}
          </span>
          <span className="text-emerald-400 font-medium">
            {isLoading ? '...' : `${wallet.balance.toFixed(3)} SOL`}
          </span>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-slate-300">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </code>
                    <button onClick={copyAddress} className="text-slate-500 hover:text-white">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1"
                  >
                    Disconnect
                    <Lock className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg" />
                  <div>
                    <p className="text-sm text-slate-400">{wallet.name || 'Main Wallet'}</p>
                    <p className="text-lg font-bold text-white">
                      {isLoading ? '...' : `${wallet.balance.toFixed(4)} SOL`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-2">
                <button
                  onClick={() => {
                    if (wallet) {
                      navigator.clipboard.writeText(wallet.address);
                      setDepositCopied(true);
                      setTimeout(() => setDepositCopied(false), 2000);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                >
                  <ArrowDown className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm">{depositCopied ? 'Address Copied!' : 'Deposit'}</span>
                  {depositCopied && <span className="ml-auto text-xs text-emerald-400">copied</span>}
                </button>
                <button
                  onClick={() => {
                    setShowWithdraw(true);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                >
                  <ArrowUp className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Withdraw</span>
                </button>
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/wallets');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-purple-400" />
                  <span className="text-sm">Transfer funds</span>
                </button>
                <a
                  href={`https://solscan.io/account/${wallet.address}${network === 'devnet' ? '?cluster=devnet' : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                >
                  <Activity className="w-4 h-4 text-orange-400" />
                  <span className="text-sm">History</span>
                  <span className="ml-auto text-xs text-slate-500">↗</span>
                </a>
              </div>

              {/* Other accounts */}
              {allWallets.length > 1 && (
                <div className="border-t border-slate-800 p-2">
                  <p className="px-3 py-1 text-xs text-slate-500 uppercase">Other Accounts</p>
                  {allWallets.filter(w => w.address !== wallet.address).slice(0, 3).map((w) => (
                    <button
                      key={w.address}
                      onClick={() => {
                        localStorage.setItem('trench_active_wallet', JSON.stringify(w));
                        window.dispatchEvent(new Event('wallet-updated'));
                        setIsOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800 rounded-lg text-left transition-colors"
                    >
                      <div className="w-6 h-6 bg-slate-700 rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{w.name}</p>
                        <p className="text-xs text-slate-500">{w.balance?.toFixed(3) || '0'} SOL</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Add account */}
              <div className="border-t border-slate-800 p-2">
                <button
                  onClick={() => {
                    window.history.pushState({}, '', '/wallets');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-800 rounded-lg text-left transition-colors"
                >
                  <Plus className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Add Account</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Withdraw Modal */}
        <WithdrawModal
          isOpen={showWithdraw}
          onClose={() => setShowWithdraw(false)}
          walletAddress={wallet.address}
          walletBalance={wallet.balance}
        />
      </div>
    );
  }

  return (
    <button
      className="btn-primary text-sm"
      onClick={() => {
        window.history.pushState({}, '', '/wallets');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      Connect Wallet
    </button>
  );
}

function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Read user info from the stored access token
  const getUser = () => {
    try {
      const token = localStorage.getItem('trench_refresh_token');
      if (!token) return null;
      const stored = sessionStorage.getItem('trench_user_info');
      if (stored) return JSON.parse(stored);
      return { label: 'Account' };
    } catch {
      return { label: 'Account' };
    }
  };

  const user = getUser();
  if (!IS_HOSTED || !user) return null;

  const displayName = user.username || user.email || (user.walletAddress ? user.walletAddress.slice(0, 6) + '...' + user.walletAddress.slice(-4) : 'User');

  const handleLogout = () => {
    window.dispatchEvent(new Event('trench-logout'));
    setIsOpen(false);
  };

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) return;
    setSaving(true);
    setUsernameError(null);
    try {
      const { apiClient } = await import('@/lib/apiClient');
      const resp: { username: string; accessToken: string } = await apiClient.put('/auth/username', { username: newUsername.trim() });
      // Update sessionStorage with new token info
      const { setAccessToken } = await import('@/lib/apiClient');
      setAccessToken(resp.accessToken);
      try {
        const payload = JSON.parse(atob(resp.accessToken.split('.')[1]));
        sessionStorage.setItem('trench_user_info', JSON.stringify({
          email: payload.email || null,
          walletAddress: payload.walletAddress || null,
          username: payload.username || null,
        }));
      } catch {}
      setEditingUsername(false);
      setNewUsername('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set username';
      // Extract error from API response if possible
      const match = msg.match(/"error":"([^"]+)"/);
      setUsernameError(match ? match[1] : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
      >
        <User className="w-4 h-4 text-slate-400" />
        {user.username && <span className="text-slate-300 text-xs hidden sm:inline">{user.username}</span>}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setEditingUsername(false); }} />
          <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-sm text-white truncate mt-0.5 font-medium">
                {displayName}
              </p>
              {user.username && user.email && (
                <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
              )}
              {user.username && user.walletAddress && (
                <p className="text-xs text-slate-500 truncate mt-0.5 font-mono">{user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}</p>
              )}
            </div>

            <div className="p-1.5 space-y-0.5">
              {/* Set/Change username */}
              {editingUsername ? (
                <div className="px-3 py-2 space-y-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => { setNewUsername(e.target.value); setUsernameError(null); }}
                    placeholder="Enter username..."
                    maxLength={32}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                  />
                  {usernameError && <p className="text-xs text-red-400">{usernameError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveUsername}
                      disabled={saving || !newUsername.trim()}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingUsername(false); setUsernameError(null); }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingUsername(true); setNewUsername(user.username || ''); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 rounded-lg text-left transition-colors group"
                >
                  <User className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
                  <span className="text-sm text-slate-300 group-hover:text-emerald-400">
                    {user.username ? 'Change Username' : 'Set Username'}
                  </span>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-500/10 rounded-lg text-left transition-colors group"
              >
                <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                <span className="text-sm text-slate-300 group-hover:text-red-400">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
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
        <NetworkSwitcher />
        <div className="w-px h-6 bg-slate-700 hidden sm:block" />
        <WalletButton />
        <AccountMenu />
      </div>
    </header>
  )
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [hasMountedMarketMaking, setHasMountedMarketMaking] = useState(window.location.pathname === '/market-making')
  const [hasMountedActivity, setHasMountedActivity] = useState(window.location.pathname === '/activity')

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname
      setCurrentPath(nextPath)
      if (nextPath === '/market-making') {
        setHasMountedMarketMaking(true)
      }
      if (nextPath === '/activity') {
        setHasMountedActivity(true)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  
  // Wrapper to pass the path
  const RouteContent = ({ path }: { path: string }) => {
    switch (path) {
      case '/': return <Dashboard />
      case '/wallets': return <TreasuryWalletManager />
      case '/snipe': return <SniperControl />
      case '/shield': return <ShieldScanner />
      case '/whales': return <WhaleAlerts />
      case '/pnl': return <PnLCharts />
      case '/activity': return null // Always-mounted below
      case '/detection': return <DetectionDashboard />
      case '/charts': return <TokenChart />
      case '/settings': return <SettingsPanel />
      default: return <Dashboard />
    }
  }
  
  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {hasMountedMarketMaking && (
              <div className={currentPath === '/market-making' ? '' : 'hidden'}>
                <MarketMaking />
              </div>
            )}
            {hasMountedActivity && (
              <div className={currentPath === '/activity' ? '' : 'hidden'}>
                <ActivityGenerator />
              </div>
            )}
            {currentPath !== '/market-making' && currentPath !== '/activity' && <RouteContent path={currentPath} />}
          </div>
        </main>
      </div>
    </div>
  )
}

export function DashboardLayout() {
  const core = (
    <ErrorBoundary>
      <NetworkProvider>
        <WalletProvider>
          <ActiveTokensProvider>
            <TxHistoryProvider>
              <PnLProvider>
                <WhaleProvider>
                  <ToastProvider>
                    <AppContent />
                  </ToastProvider>
                </WhaleProvider>
              </PnLProvider>
            </TxHistoryProvider>
          </ActiveTokensProvider>
        </WalletProvider>
      </NetworkProvider>
    </ErrorBoundary>
  )

  if (IS_HOSTED) {
    return (
      <AuthProvider>
        <AuthGate>{core}</AuthGate>
      </AuthProvider>
    )
  }

  return core
}

export default DashboardLayout;
